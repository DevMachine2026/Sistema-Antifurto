import dgram from 'dgram';
import crypto from 'crypto';
import os from 'os';

export interface OnvifDevice {
  ip: string;
  port: number;
  manufacturer: string;
  model: string;
  profileTokens: string[];
}

const MULTICAST_ADDR = '239.255.255.250';
const ONVIF_PORT = 3702;

function probeMessage(uuid: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <s:Header>
    <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>
    <a:MessageID>uuid:${uuid}</a:MessageID>
    <a:ReplyTo>
      <a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address>
    </a:ReplyTo>
    <a:To s:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To>
  </s:Header>
  <s:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </s:Body>
</s:Envelope>`;
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<[^>]*:?${tag}[^>]*>([^<]+)<\\/[^>]*:?${tag}>`, 'i');
  return xml.match(re)?.[1]?.trim() ?? '';
}

function parseXAddrs(xml: string): string[] {
  const raw = extractTag(xml, 'XAddrs');
  return raw ? raw.split(/\s+/) : [];
}

function parseScopes(xml: string): { manufacturer: string; model: string } {
  const raw = extractTag(xml, 'Scopes');
  const manufacturer = decodeURIComponent(
    raw.match(/onvif:\/\/www\.onvif\.org\/mfr\/([^\s]+)/)?.[1] ?? ''
  );
  const model = decodeURIComponent(
    raw.match(/onvif:\/\/www\.onvif\.org\/model\/([^\s]+)/)?.[1] ?? ''
  );
  return { manufacturer, model };
}

function xaddrToIpPort(xaddr: string): { ip: string; port: number } | null {
  try {
    const url = new URL(xaddr);
    return { ip: url.hostname, port: parseInt(url.port) || 80 };
  } catch {
    return null;
  }
}

function getLocalAddresses(): string[] {
  const ifaces = os.networkInterfaces();
  const addrs: string[] = [];
  for (const list of Object.values(ifaces)) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) addrs.push(addr.address);
    }
  }
  return addrs;
}

export async function discoverOnvif(timeoutMs = 3000): Promise<OnvifDevice[]> {
  const seen = new Map<string, OnvifDevice>();
  const uuid = crypto.randomUUID();
  const msg = Buffer.from(probeMessage(uuid));
  const localAddrs = getLocalAddresses();

  const sockets: dgram.Socket[] = [];

  const bindAddrs = localAddrs.length > 0 ? localAddrs : ['0.0.0.0'];

  await Promise.all(
    bindAddrs.map(
      (bindAddr) =>
        new Promise<void>((resolve) => {
          const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
          sockets.push(sock);

          sock.on('message', (data) => {
            const xml = data.toString('utf-8');
            const xaddrs = parseXAddrs(xml);
            for (const xaddr of xaddrs) {
              const parsed = xaddrToIpPort(xaddr);
              if (!parsed) continue;
              if (seen.has(parsed.ip)) continue;
              const { manufacturer, model } = parseScopes(xml);
              seen.set(parsed.ip, {
                ip: parsed.ip,
                port: parsed.port,
                manufacturer,
                model,
                profileTokens: [],
              });
            }
          });

          sock.on('error', () => resolve());

          sock.bind(0, bindAddr, () => {
            try {
              sock.setMulticastTTL(128);
              sock.send(msg, ONVIF_PORT, MULTICAST_ADDR, (err) => {
                if (err) resolve();
              });
            } catch {
              resolve();
            }
          });

          setTimeout(() => resolve(), timeoutMs);
        })
    )
  );

  for (const sock of sockets) {
    try { sock.close(); } catch {}
  }

  return Array.from(seen.values());
}

import net from 'net';
import os from 'os';

export interface CameraCandidate {
  ip: string;
  port: number;
  brand: 'intelbras' | 'hikvision' | 'dahua' | 'generic';
  hasRtsp: boolean;
  openPorts: number[];
}

const SCAN_PORTS = [554, 8000, 8080, 37777];
const TIMEOUT_MS = 500;
const BATCH_SIZE = 30;

function probePort(ip: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (open: boolean) => {
      if (!settled) { settled = true; sock.destroy(); resolve(open); }
    };
    sock.setTimeout(TIMEOUT_MS);
    sock.on('connect', () => finish(true));
    sock.on('timeout', () => finish(false));
    sock.on('error', () => finish(false));
    sock.connect(port, ip);
  });
}

function classifyCamera(openPorts: number[]): CameraCandidate['brand'] {
  if (openPorts.includes(37777)) return 'dahua';
  if (openPorts.includes(8000)) return 'intelbras';
  return 'generic';
}

function pickHttpPort(openPorts: number[]): number {
  return (
    openPorts.find((p) => p === 80) ??
    openPorts.find((p) => [8080, 8000].includes(p)) ??
    openPorts[0]
  );
}

export function getLocalSubnet(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const parts = addr.address.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    }
  }
  return null;
}

export async function scanSubnet(
  subnet: string,
  onProgress?: (found: CameraCandidate[], scanned: number, total: number) => void,
): Promise<CameraCandidate[]> {
  const ips: string[] = [];
  for (let i = 1; i <= 254; i++) ips.push(`${subnet}.${i}`);

  const openMap = new Map<string, Set<number>>();
  const total = ips.length;

  for (let i = 0; i < ips.length; i += BATCH_SIZE) {
    const batch = ips.slice(i, i + BATCH_SIZE);
    const probes = batch.flatMap((ip) =>
      SCAN_PORTS.map((port) =>
        probePort(ip, port).then((open) => ({ ip, port, open }))
      )
    );

    for (const { ip, port, open } of await Promise.all(probes)) {
      if (open) {
        if (!openMap.has(ip)) openMap.set(ip, new Set());
        openMap.get(ip)!.add(port);
      }
    }

    onProgress?.(buildCandidates(openMap), Math.min(i + BATCH_SIZE, total), total);
  }

  return buildCandidates(openMap);
}

function buildCandidates(openMap: Map<string, Set<number>>): CameraCandidate[] {
  return Array.from(openMap.entries())
    .map(([ip, ports]) => {
      const openPorts = Array.from(ports);
      const hasRtsp = openPorts.includes(554);
      const brand = classifyCamera(openPorts);
      const port = pickHttpPort(openPorts);
      return { ip, port, brand, hasRtsp, openPorts };
    })
    .sort((a, b) => {
      const score = (c: CameraCandidate) =>
        (c.hasRtsp ? 4 : 0) +
        (c.openPorts.includes(37777) || c.openPorts.includes(8000) ? 2 : 0);
      return score(b) - score(a);
    });
}

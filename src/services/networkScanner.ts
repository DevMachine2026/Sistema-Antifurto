export interface CameraCandidate {
  ip: string;
  openPorts: number[];
  confidence: 'high' | 'medium' | 'low';
  likelyBrand: 'intelbras' | 'hikvision' | 'dahua' | 'generic';
  hasRtsp: boolean;     // porta 554 aberta = streaming de vídeo confirmado
  httpPort: number;     // porta para abrir interface web
}

export type ScanCapability = 'ok' | 'blocked' | 'unknown';

// 554  = RTSP (câmera de vídeo confirmada)
// 8000 = SDK Hikvision/Intelbras
// 8080 = web alternativo (câmeras genéricas/Dahua)
// 37777 = SDK Dahua
const CAMERA_PORTS    = [80, 554, 8000, 8080, 37777];
const BATCH_SIZE      = 20;
const PROBE_TIMEOUT   = 1000;
// Conexão recusada rapidamente = host existe (TCP RST em < 120ms)
const REFUSED_THRESH  = 120;

// URLs de snapshot para tentativa de thumbnail
export const SNAPSHOT_PATHS = [
  '/cgi-bin/snapshot.cgi',                     // Dahua / genérica
  '/ISAPI/Streaming/channels/1/picture',        // Intelbras / Hikvision
  '/snapshot.jpg',                              // genérica
  '/jpg/image.jpg',                             // genérica
  '/cgi-bin/mjpeg',                             // genérica
  '/snap.jpg',                                  // genérica
];

// ── sub-rede local via WebRTC ────────────────────────────────────────────────

export async function detectLocalSubnet(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.createOffer().then((o) => pc.setLocalDescription(o));
      const t = setTimeout(() => { pc.close(); resolve(null); }, 3000);
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        const m = /(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}/.exec(candidate.candidate);
        if (m && !m[1].startsWith('0.') && !m[1].startsWith('127.')) {
          clearTimeout(t); pc.close(); resolve(m[1]);
        }
      };
    } catch { resolve(null); }
  });
}

// ── sonda individual ─────────────────────────────────────────────────────────

async function probePort(ip: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };

    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT);

    // Fetch no-cors: opaque response = porta aberta
    const ctrl = new AbortController();
    fetch(`http://${ip}:${port}/`, { signal: ctrl.signal, mode: 'no-cors', cache: 'no-store' })
      .then(() => { clearTimeout(timer); finish(true); })
      .catch((err: Error) => {
        clearTimeout(timer);
        if (err.name === 'AbortError') { finish(false); return; }
        // Resposta rápida = TCP RST = host existe (porta errada mas host está lá)
        const elapsed = performance.now() - start;
        finish(elapsed < REFUSED_THRESH);
      });
  });
}

// ── calibração: verifica se o browser permite probes ────────────────────────
// Testa o gateway (x.x.x.1) — quase sempre existe na rede local.
// Se não responder, o browser está bloqueando (Brave, Firefox Strict, etc.)

export async function checkScanCapability(subnet: string): Promise<ScanCapability> {
  const gateway = `${subnet}.1`;
  const start = performance.now();
  const reachable = await probePort(gateway, 80);
  const elapsed = performance.now() - start;

  if (reachable) return 'ok';
  // Se a sonda retornou em < 20ms e não encontrou nada, o browser bloqueou
  if (elapsed < 20) return 'blocked';
  return 'unknown'; // gateway pode simplesmente não ter porta 80 aberta
}

// ── varredura completa ───────────────────────────────────────────────────────

export async function scanNetwork(
  subnet: string,
  onProgress: (found: CameraCandidate[], scanned: number, total: number) => void,
  signal?: AbortSignal,
): Promise<CameraCandidate[]> {
  const ips: string[] = [];
  for (let i = 1; i <= 254; i++) ips.push(`${subnet}.${i}`);

  const openMap = new Map<string, Set<number>>();

  for (let i = 0; i < ips.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;

    const batch = ips.slice(i, i + BATCH_SIZE);
    const probes = batch.flatMap((ip) =>
      CAMERA_PORTS.map((port) =>
        probePort(ip, port).then((open) => ({ ip, port, open }))
      )
    );

    for (const { ip, port, open } of await Promise.all(probes)) {
      if (open) {
        if (!openMap.has(ip)) openMap.set(ip, new Set());
        openMap.get(ip)!.add(port);
      }
    }

    onProgress(buildCandidates(openMap), Math.min(i + BATCH_SIZE, ips.length), ips.length);
  }

  return buildCandidates(openMap);
}

function buildCandidates(map: Map<string, Set<number>>): CameraCandidate[] {
  return Array.from(map.entries())
    .map(([ip, ports]) => {
      const openPorts = Array.from(ports);
      const hasRtsp   = openPorts.includes(554);
      const has8000   = openPorts.includes(8000);
      const has8080   = openPorts.includes(8080);
      const has37777  = openPorts.includes(37777);

      // Câmera confirmada = RTSP ou porta SDK específica de câmera
      const confidence: CameraCandidate['confidence'] =
        hasRtsp || has8000 || has37777 ? 'high' :
        has8080 ? 'high' :
        openPorts.includes(80) ? 'medium' : 'low';

      // Detecção de marca por assinatura de porta
      const likelyBrand: CameraCandidate['likelyBrand'] =
        has37777                    ? 'dahua' :
        has8000 && !has37777        ? 'intelbras' :
        has8080 && !has8000         ? 'generic' :
        'generic';

      const httpPort = openPorts.includes(80) ? 80 : openPorts.find(p => [8080, 8000].includes(p)) ?? openPorts[0];

      return { ip, openPorts, confidence, likelyBrand, hasRtsp, httpPort };
    })
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.confidence] - order[b.confidence];
    });
}

// ── utils ────────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

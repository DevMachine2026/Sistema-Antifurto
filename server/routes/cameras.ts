import { Router, Request, Response } from 'express';
import http from 'http';
import https from 'https';
import { discoverOnvif } from '../lib/onvifScanner';
import { scanSubnet, getLocalSubnet, CameraCandidate } from '../lib/portScanner';

const router = Router();

const SNAPSHOT_PATHS = [
  '/cgi-bin/snapshot.cgi',
  '/ISAPI/Streaming/channels/1/picture',
  '/snapshot.jpg',
  '/jpg/image.jpg',
  '/snap.jpg',
];

interface DiscoveredCamera {
  ip: string;
  port: number;
  brand: string;
  hasRtsp: boolean;
  snapshotUrl: string | null;
  onvifProfileToken: string | null;
}

function guessSnapshotUrl(ip: string, port: number, brand: string): string | null {
  const base = `http://${ip}:${port}`;
  if (brand === 'intelbras' || brand === 'hikvision') return `${base}/ISAPI/Streaming/channels/1/picture`;
  if (brand === 'dahua') return `${base}/cgi-bin/snapshot.cgi`;
  return `${base}/snapshot.jpg`;
}

router.get('/discover', async (_req: Request, res: Response) => {
  const subnet = getLocalSubnet();

  const [onvifDevices, portCandidates] = await Promise.all([
    discoverOnvif(3000).catch(() => []),
    subnet
      ? scanSubnet(subnet).catch(() => [] as CameraCandidate[])
      : Promise.resolve([] as CameraCandidate[]),
  ]);

  const merged = new Map<string, DiscoveredCamera>();

  for (const dev of onvifDevices) {
    merged.set(dev.ip, {
      ip: dev.ip,
      port: dev.port,
      brand: normalizeBrand(dev.manufacturer),
      hasRtsp: false,
      snapshotUrl: null,
      onvifProfileToken: dev.profileTokens[0] ?? null,
    });
  }

  for (const cam of portCandidates) {
    const existing = merged.get(cam.ip);
    if (existing) {
      existing.hasRtsp = cam.hasRtsp;
      if (!existing.snapshotUrl) {
        existing.snapshotUrl = guessSnapshotUrl(cam.ip, cam.port, existing.brand);
      }
    } else {
      merged.set(cam.ip, {
        ip: cam.ip,
        port: cam.port,
        brand: cam.brand,
        hasRtsp: cam.hasRtsp,
        snapshotUrl: guessSnapshotUrl(cam.ip, cam.port, cam.brand),
        onvifProfileToken: null,
      });
    }
  }

  res.json(Array.from(merged.values()));
});

router.get('/:ip/snapshot', async (req: Request, res: Response) => {
  const { ip } = req.params;
  const port = parseInt(req.query.port as string) || 80;

  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    res.status(400).json({ error: 'Invalid IP' });
    return;
  }

  for (const path of SNAPSHOT_PATHS) {
    const url = `http://${ip}:${port}${path}`;
    const buf = await fetchBuffer(url);
    if (buf && isJpeg(buf)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(buf);
      return;
    }
  }

  res.status(404).json({ error: 'No snapshot available' });
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    version: process.version,
  });
});

function fetchBuffer(url: string, timeoutMs = 3000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    try {
      const req = mod.get(url, { timeout: timeoutMs }, (res) => {
        if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function normalizeBrand(manufacturer: string): string {
  const m = manufacturer.toLowerCase();
  if (m.includes('dahua')) return 'dahua';
  if (m.includes('hikvision')) return 'hikvision';
  if (m.includes('intelbras')) return 'intelbras';
  return 'generic';
}

export default router;

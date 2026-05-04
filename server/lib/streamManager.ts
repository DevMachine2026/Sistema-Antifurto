const MEDIAMTX_API = process.env.MEDIAMTX_API ?? process.env.MEDIAMTX_API_URL ?? 'http://localhost:9997';

export interface Camera {
  camera_id: string;
  ip: string;
  port: number;
  brand: string;
  status: string;
}

function rtspUrl(camera: Camera): string | null {
  const { ip, port, brand } = camera;
  switch (brand) {
    case 'intelbras':
      return `rtsp://${ip}:${port}/cam/realmonitor?channel=1&subtype=0`;
    case 'hikvision':
      return `rtsp://${ip}:554/Streaming/channels/101`;
    case 'dahua':
      return `rtsp://${ip}:554/cam/realmonitor?channel=1&subtype=0`;
    default:
      return null; // generic: aceita push, não faz pull
  }
}

export class StreamManager {
  async syncStreams(cameras: Camera[]): Promise<void> {
    const online = cameras.filter((c) => c.status === 'online' && c.ip);
    await Promise.allSettled(
      online.map((cam) => {
        const url = rtspUrl(cam);
        const body = url ? { source: url, sourceOnDemand: true } : {};
        return fetch(`${MEDIAMTX_API}/v3/config/paths/add/${encodeURIComponent(cam.camera_id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => {
          if (!r.ok && r.status !== 409 && r.status !== 400) {
            return r.text().then((t) =>
              console.error(`[StreamManager] add ${cam.camera_id} failed ${r.status}: ${t}`)
            );
          }
        }).catch((err) =>
          console.error(`[StreamManager] add ${cam.camera_id} error:`, err)
        );
      })
    );
  }

  async removeStream(cameraId: string): Promise<void> {
    const res = await fetch(
      `${MEDIAMTX_API}/v3/config/paths/delete/${encodeURIComponent(cameraId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      throw new Error(`MediaMTX DELETE ${cameraId} → ${res.status}: ${body}`);
    }
  }

  async getStreamStatus(cameraId: string): Promise<{ active: boolean; readers: number }> {
    try {
      const res = await fetch(
        `${MEDIAMTX_API}/v3/paths/get/${encodeURIComponent(cameraId)}`
      );
      if (res.status === 404) return { active: false, readers: 0 };
      if (!res.ok) {
        console.warn(`[StreamManager] getStreamStatus ${cameraId}: ${res.status}`);
        return { active: false, readers: 0 };
      }
      const data = (await res.json()) as { readers?: unknown[] };
      const readers = Array.isArray(data.readers) ? data.readers.length : 0;
      return { active: true, readers };
    } catch (err) {
      console.warn(`[StreamManager] getStreamStatus ${cameraId} error:`, err);
      return { active: false, readers: 0 };
    }
  }
}

export const streamManager = new StreamManager();

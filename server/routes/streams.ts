import { Router, Request, Response } from 'express';
import { streamManager } from '../lib/streamManager';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const MEDIAMTX_API = process.env.MEDIAMTX_API ?? process.env.MEDIAMTX_API_URL ?? 'http://localhost:9997';
const HLS_BASE = process.env.MEDIAMTX_HLS_URL ?? 'http://localhost:8888';

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

// GET /api/streams — lista todos os paths ativos no MediaMTX
router.get('/', async (_req: Request, res: Response) => {
  const r = await fetch(`${MEDIAMTX_API}/v3/paths/list`).catch(() => null);
  if (!r || !r.ok) {
    res.status(502).json({ error: 'MediaMTX unavailable' });
    return;
  }
  const data = await r.json();
  res.json(data);
});

// POST /api/streams/:cameraId/start — adiciona path para a câmera
router.post('/:cameraId/start', async (req: Request, res: Response) => {
  const { cameraId } = req.params;

  const db = supabase();
  const { data: cam, error } = await db
    .from('cameras')
    .select('camera_id, ip, port, brand, status')
    .eq('camera_id', cameraId)
    .single();

  if (error || !cam) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  try {
    await streamManager.syncStreams([cam]);
    res.json({ ok: true, hlsUrl: `${HLS_BASE}/${cameraId}/index.m3u8` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/streams/:cameraId — remove path do MediaMTX
router.delete('/:cameraId', async (req: Request, res: Response) => {
  const { cameraId } = req.params;
  try {
    await streamManager.removeStream(cameraId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/streams/:cameraId/hls-url — retorna URL HLS para o frontend
router.get('/:cameraId/hls-url', async (req: Request, res: Response) => {
  const { cameraId } = req.params;
  try {
    const status = await streamManager.getStreamStatus(cameraId);
    res.json({
      cameraId,
      hlsUrl: `${HLS_BASE}/${cameraId}/index.m3u8`,
      ...status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

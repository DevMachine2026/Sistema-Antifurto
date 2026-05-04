import express, { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import cameraRoutes from './routes/cameras';
import streamRoutes from './routes/streams';
import { streamManager } from './lib/streamManager';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3456');

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use(express.json());

app.use('/api/cameras', cameraRoutes);
app.use('/api/streams', streamRoutes);

async function syncCamerasFromSupabase(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[streams] SUPABASE_URL/KEY not set — skipping stream sync');
    return;
  }
  const db = createClient(url, key);
  const { data, error } = await db
    .from('cameras')
    .select('camera_id, ip, port, brand, status')
    .eq('status', 'online');
  if (error) {
    console.error('[streams] Supabase query error:', error.message);
    return;
  }
  await streamManager.syncStreams(data ?? []);
  console.log(`[streams] synced ${(data ?? []).length} online camera(s)`);
}

app.listen(PORT, async () => {
  console.log(`server listening on http://localhost:${PORT}`);
  await syncCamerasFromSupabase();
  setInterval(syncCamerasFromSupabase, 60_000);
});

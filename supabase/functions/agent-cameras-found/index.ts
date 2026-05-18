// supabase/functions/agent-cameras-found/index.ts
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

// Rate limiter: 10 req/min por IP — scan é raro, limite mais conservador
const _rl = new Map<string, { n: number; resetAt: number }>();
function rateLimit(req: Request): boolean {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = _rl.get(ip);
  if (!entry || now > entry.resetAt) { _rl.set(ip, { n: 1, resetAt: now + 60_000 }); return true; }
  if (entry.n >= 10) return false;
  entry.n++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!rateLimit(req)) return json({ error: 'rate_limit_exceeded' }, 429);

  const token = getBearerToken(req);
  if (!token) return json({ error: 'missing_bearer_token' }, 401);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: agent, error: agentError } = await supabase
      .from('agent_configs')
      .select('id, establishment_id')
      .eq('token', token)
      .eq('active', true)
      .single();

    if (agentError || !agent) return json({ error: 'invalid_token' }, 401);

    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const cameras: Array<{
      ip: string;
      mac?: string;
      name?: string;
      port?: number;
      service_url?: string;
      manufacturer?: string;
      device_type?: string;
      channel_count?: number;
      username?: string;
      password?: string;
      credentials_ok?: boolean;
    }> = body.cameras ?? [];
    if (!Array.isArray(cameras) || cameras.length === 0) {
      return json({ ok: true, inserted: 0 });
    }

    // Insere apenas câmeras que ainda não foram reportadas para este agente
    const { data: existing } = await supabase
      .from('agent_camera_candidates')
      .select('ip')
      .eq('agent_id', agent.id);

    const existingIps = new Set((existing ?? []).map((r: any) => r.ip));
    const newCameras = cameras.filter((c) => !existingIps.has(c.ip));

    if (newCameras.length > 0) {
      await supabase.from('agent_camera_candidates').insert(
        newCameras.map((c) => ({
          agent_id:       agent.id,
          ip:             c.ip,
          mac:            c.mac           ?? null,
          name:           c.name          ?? null,
          port:           c.port          ?? null,
          service_url:    c.service_url   ?? null,
          manufacturer:   c.manufacturer  ?? null,
          device_type:    c.device_type   ?? 'camera',
          channel_count:  c.channel_count ?? null,
          username:       null,
          password:       null,
          credentials_ok: c.credentials_ok ?? null,
          approved:       true,
        })),
      );
    }

    // Auto-registra câmeras para TODAS reportadas (novas e já conhecidas).
    // ignoreDuplicates=true protege nomes que o merchant já personalizou.
    if (agent.establishment_id && cameras.length > 0) {
      const brandKeywords: Record<string, string> = {
        intelbras: 'intelbras', hikvision: 'hikvision', dahua: 'dahua',
      };
      const cameraRows = cameras.map((c) => {
        const mfr = (c.manufacturer ?? '').toLowerCase();
        const brand = Object.entries(brandKeywords).find(([k]) => mfr.includes(k))?.[1] ?? 'generic';
        const brandLabel = brand === 'intelbras' ? 'Intelbras'
          : brand === 'hikvision' ? 'Hikvision'
          : brand === 'dahua' ? 'Dahua' : '';
        let name: string;
        if (c.device_type === 'dvr') {
          name = `DVR ${brandLabel || 'Genérico'}${c.channel_count ? ` — ${c.channel_count} canais` : ''}`;
        } else {
          name = brandLabel ? `Câmera ${brandLabel}` : `Câmera ${c.ip}`;
        }
        return {
          establishment_id: agent.establishment_id,
          name,
          camera_id:  `auto-${c.ip.replace(/\./g, '-')}`,
          ip:         c.ip,
          port:       c.port ?? 80,
          brand,
          camera_type: 'people_counting',
          status:     'online',
        };
      });

      await supabase.from('cameras').upsert(cameraRows, {
        onConflict: 'establishment_id,camera_id',
        ignoreDuplicates: true,
      });
    }

    return json({ ok: true, inserted: newCameras.length });
  } catch (err: any) {
    console.error('agent-cameras-found error:', err?.message ?? err);
    return json({ error: 'internal_error' }, 500);
  }
});

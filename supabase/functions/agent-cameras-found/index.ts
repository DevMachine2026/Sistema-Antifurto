// supabase/functions/agent-cameras-found/index.ts
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = getBearerToken(req);
  if (!token) return json({ error: 'missing_bearer_token' }, 401);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: agent, error: agentError } = await supabase
      .from('agent_configs')
      .select('id')
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

    const cameras: Array<{ ip: string; mac?: string; name?: string }> = body.cameras ?? [];
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
          agent_id: agent.id,
          ip:       c.ip,
          mac:      c.mac ?? null,
          name:     c.name ?? null,
          approved: null,
        })),
      );
    }

    return json({ ok: true, inserted: newCameras.length });
  } catch (err: any) {
    console.error('agent-cameras-found error:', err?.message ?? err);
    return json({ error: 'internal_error' }, 500);
  }
});

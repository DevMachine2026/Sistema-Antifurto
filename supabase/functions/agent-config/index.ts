// supabase/functions/agent-config/index.ts
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimit.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!(await checkRateLimit('agent-config', req, 20))) {
    return json({ error: 'rate_limit_exceeded' }, 429);
  }

  const token = getBearerToken(req);
  if (!token) return json({ error: 'missing_bearer_token' }, 401);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: agent, error: agentError } = await supabase
      .from('agent_configs')
      .select('id, establishment_id, name, cameras, thresholds, heartbeat_interval, config_changed_at')
      .eq('token', token)
      .eq('active', true)
      .single();

    if (agentError || !agent) return json({ error: 'invalid_token' }, 401);

    // Último people_inside por câmera nas últimas 24h — usado pelo agente para
    // inicializar a contagem corretamente após reinicialização.
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recentPeople } = await supabase
      .from('people_count_events')
      .select('camera_id, people_inside, recorded_at')
      .eq('establishment_id', agent.establishment_id)
      .gte('recorded_at', since24h)
      .order('recorded_at', { ascending: false })
      .limit(200);

    const cameraStates: Record<string, number> = {};
    for (const row of recentPeople ?? []) {
      if (cameraStates[row.camera_id] === undefined) {
        cameraStates[row.camera_id] = row.people_inside;
      }
    }

    // Atualiza timestamp de última conexão (best-effort — não bloqueia resposta)
    supabase
      .from('agent_configs')
      .update({ last_connected_at: new Date().toISOString() })
      .eq('id', agent.id)
      .then(({ error }) => { if (error) console.error('last_connected_at update failed:', error.message); });

    const minAgentVersion = Deno.env.get('AGENT_MIN_VERSION')?.trim() || '0.1.0';

    return json({
      agent_id: agent.id,
      name: agent.name,
      cameras: agent.cameras,
      thresholds: agent.thresholds,
      heartbeat_interval: agent.heartbeat_interval,
      config_changed_at: agent.config_changed_at,
      supabase_url: Deno.env.get('SUPABASE_URL'),
      min_agent_version: minAgentVersion,
      camera_states: cameraStates,
    });
  } catch (err: any) {
    console.error('agent-config error:', err?.message ?? err);
    return json({ error: 'internal_error' }, 500);
  }
});

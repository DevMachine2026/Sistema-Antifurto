// supabase/functions/agent-config/index.ts
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
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

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

    const { data: settings } = await supabase
      .from('settings')
      .select('webhook_token')
      .eq('establishment_id', agent.establishment_id)
      .single();

    // Atualiza timestamp de última conexão (best-effort — não bloqueia resposta)
    supabase
      .from('agent_configs')
      .update({ last_connected_at: new Date().toISOString() })
      .eq('id', agent.id)
      .then(({ error }) => { if (error) console.error('last_connected_at update failed:', error.message); });

    return json({
      agent_id: agent.id,
      name: agent.name,
      cameras: agent.cameras,
      thresholds: agent.thresholds,
      heartbeat_interval: agent.heartbeat_interval,
      webhook_token: settings?.webhook_token ?? null,
      config_changed_at: agent.config_changed_at,
      supabase_url: Deno.env.get('SUPABASE_URL'),
    });
  } catch (err: any) {
    console.error('agent-config error:', err?.message ?? err);
    return json({ error: 'internal_error' }, 500);
  }
});

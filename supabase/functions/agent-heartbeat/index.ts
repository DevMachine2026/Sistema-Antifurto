// supabase/functions/agent-heartbeat/index.ts
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
      .select('id, config_changed_at')
      .eq('token', token)
      .eq('active', true)
      .single();

    if (agentError || !agent) return json({ error: 'invalid_token' }, 401);

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* heartbeat sem body é válido */ }

    const now = new Date().toISOString();

    await supabase
      .from('agent_heartbeats')
      .upsert({
        agent_id:       agent.id,
        version:        body.version ?? '0.0.0',
        cameras_online: body.cameras_online ?? 0,
        last_inference: body.last_inference ?? null,
        reported_at:    now,
      }, { onConflict: 'agent_id' });

    // config_updated: compara config_changed_at do DB (quando admin salvou)
    // com last_config_changed_at que o agente envia (valor que recebeu na última chamada agent-config)
    const dbChangedAt = new Date(agent.config_changed_at).getTime();
    const agentSeenAt = body.last_config_changed_at
      ? new Date(body.last_config_changed_at).getTime()
      : 0;
    const configUpdated = dbChangedAt > agentSeenAt;

    return json({ ok: true, config_updated: configUpdated, server_time: now });
  } catch (err: any) {
    console.error('agent-heartbeat error:', err?.message ?? err);
    return json({ error: 'internal_error' }, 500);
  }
});

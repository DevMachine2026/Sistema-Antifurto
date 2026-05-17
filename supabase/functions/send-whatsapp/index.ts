// @ts-nocheck
function isServiceRoleRequest(req: Request): boolean {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!expected) return false;
  const auth = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return !!token && token === expected;
}

/**
 * send-whatsapp — envia mensagem via WhatsApp usando Evolution API (ou compatível).
 *
 * Secrets necessários no Supabase:
 *   WHATSAPP_API_URL   — URL completa do endpoint de envio
 *                        Ex Evolution API: https://api.seudominio.com/message/sendText/minha-instancia
 *                        Ex Z-API:         https://api.z-api.io/instances/ID/token/TOKEN/send-text
 *   WHATSAPP_API_TOKEN — chave de autenticação (campo "apikey" no header)
 *
 * Body esperado (POST):
 *   { establishment_id, number, message }
 *   Ou chamada direta com: { number, message }  (sem establishment_id)
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info, prefer, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!isServiceRoleRequest(req)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const apiUrl   = Deno.env.get('WHATSAPP_API_URL');
    const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');

    if (!apiUrl) return json({ error: 'whatsapp_api_url_not_configured' }, 500);

    const body = await req.json();
    const number  = String(body.number  ?? '').trim().replace(/\D/g, '');
    const message = String(body.message ?? '').trim();

    if (!number)  return json({ error: 'invalid_number' }, 400);
    if (!message) return json({ error: 'invalid_message' }, 400);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiToken) headers['apikey'] = apiToken;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number, text: message }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(JSON.stringify({ level: 'error', event: 'whatsapp_send_failed', status: res.status, detail }));
      return json({ error: 'whatsapp_send_failed', status: res.status, detail }, 502);
    }

    console.info(JSON.stringify({ level: 'info', event: 'whatsapp_sent', number }));
    return json({ ok: true });
  } catch (err: any) {
    console.error(JSON.stringify({ level: 'error', event: 'request_failed', error: String(err?.message ?? err) }));
    return json({ error: 'internal_error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

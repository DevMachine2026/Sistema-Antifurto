// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isServiceRoleRequest } from '../_shared/internalAuth.ts';
import { createLogContext, durationMs, logError, logInfo } from '../_shared/log.ts';

// supabase-js envia x-client-info no invoke; sem isso o preflight falha no browser (ex.: localhost).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info, prefer, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  const ctx = createLogContext(req, 'send-telegram');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    logInfo(ctx, 'request_rejected', { reason: 'method_not_allowed' });
    return json({ error: 'method_not_allowed', request_id: ctx.request_id }, 405);
  }

  if (!isServiceRoleRequest(req)) {
    logInfo(ctx, 'auth_failed', { reason: 'service_role_required' });
    return json({ error: 'unauthorized', request_id: ctx.request_id }, 401);
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      logError(ctx, 'secret_missing', { secret: 'TELEGRAM_BOT_TOKEN' });
      return json({ error: 'telegram_bot_token_not_configured', request_id: ctx.request_id }, 500);
    }

    const body = await readJsonBody(req);
    const establishmentId = String(body.establishment_id ?? '').trim();
    const message = String(body.message ?? '').trim();
    const chatIdOverride = String(body.chat_id ?? '').trim();

    if (!establishmentId) return json({ error: 'invalid_establishment_id', request_id: ctx.request_id }, 400);
    if (!message) return json({ error: 'invalid_message', request_id: ctx.request_id }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('telegram_chat_id')
      .eq('establishment_id', establishmentId)
      .single();

    if (settingsError) {
      logInfo(ctx, 'settings_not_found', { establishment_id: establishmentId });
      return json({ error: 'settings_not_found', request_id: ctx.request_id }, 404);
    }

    const chatId = chatIdOverride || String(settings?.telegram_chat_id ?? '').trim();
    if (!chatId) return json({ error: 'telegram_chat_id_not_configured', request_id: ctx.request_id }, 400);

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const telegramPayload = await telegramRes.json();
    if (!telegramRes.ok || !telegramPayload?.ok) {
      logError(ctx, 'telegram_send_failed', {
        establishment_id: establishmentId,
        status: telegramRes.status,
        detail: telegramPayload?.description ?? 'unknown_error',
      });
      return json({
        error: 'telegram_send_failed',
        detail: telegramPayload?.description ?? 'unknown_error',
        request_id: ctx.request_id,
      }, 502);
    }

    logInfo(ctx, 'telegram_sent', {
      establishment_id: establishmentId,
      duration_ms: durationMs(ctx),
    });
    return json({ ok: true, request_id: ctx.request_id });
  } catch (err: any) {
    logError(ctx, 'request_failed', {
      error: String(err?.message ?? err),
      duration_ms: durationMs(ctx),
    });
    return json({
      error: 'internal_error',
      detail: String(err?.message ?? err),
      request_id: ctx.request_id,
    }, 500);
  }
});

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('invalid_json_payload');
    }
    return body as Record<string, unknown>;
  } catch {
    throw new Error('invalid_json_payload');
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

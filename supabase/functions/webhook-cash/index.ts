import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  const ctx = createLogContext(req, 'webhook-cash');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', request_id: ctx.request_id }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = getBearerToken(req);
    if (!token) return json({ error: 'missing_bearer_token', request_id: ctx.request_id }, 401);

    const { data: settings } = await supabase
      .from('settings')
      .select('establishment_id')
      .eq('webhook_token', token)
      .single();

    if (!settings) return json({ error: 'invalid_bearer_token', request_id: ctx.request_id }, 401);

    const body = await readJsonBody(req);

    // Payload esperado do Raspberry Pi:
    // { camera_id, detected_at, confidence, window_minutes? }
    const cameraId     = String(body.camera_id ?? 'cam-caixa').trim();
    const detectedAt   = String(body.detected_at ?? new Date().toISOString());
    const windowMin    = Number(body.window_minutes ?? 15);
    const confidence   = Number(body.confidence    ?? 1.0);

    if (!cameraId) return json({ error: 'invalid_camera_id', request_id: ctx.request_id }, 400);
    if (!Number.isFinite(windowMin) || windowMin <= 0 || windowMin > 120) {
      return json({ error: 'invalid_window_minutes', request_id: ctx.request_id }, 400);
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return json({ error: 'invalid_confidence', request_id: ctx.request_id }, 400);
    }
    if (!isIsoDate(detectedAt)) return json({ error: 'invalid_detected_at', request_id: ctx.request_id }, 400);

    // Ignora detecções com baixa confiança
    if (confidence < 0.7) {
      logInfo(ctx, 'ingest_skipped', {
        establishment_id: settings.establishment_id,
        reason: 'confidence_too_low',
        confidence,
        duration_ms: durationMs(ctx),
      });
      return json({ ok: true, skipped: true, reason: 'confidence_too_low', request_id: ctx.request_id });
    }

    const eventKey = String(
      body.event_id ??
      body.source_event_id ??
      await buildEventKey({
        camera_id: cameraId,
        detected_at: detectedAt,
        window_minutes: windowMin,
      })
    );

    const { data: existing } = await supabase
      .from('cash_payment_events')
      .select('id')
      .eq('establishment_id', settings.establishment_id)
      .eq('external_event_key', eventKey)
      .limit(1);

    if (existing && existing.length > 0) {
      logInfo(ctx, 'ingest_deduplicated', {
        establishment_id: settings.establishment_id,
        event_key: eventKey,
        deduplicated: true,
        duration_ms: durationMs(ctx),
      });
      return json({ ok: true, deduplicated: true, event_key: eventKey, camera_id: cameraId, detected_at: detectedAt, request_id: ctx.request_id });
    }

    const { error } = await supabase.from('cash_payment_events').insert({
      establishment_id: settings.establishment_id,
      external_event_key: eventKey,
      camera_id:        cameraId,
      detected_at:      detectedAt,
      window_minutes:   windowMin,
    });

    if (error) throw error;

    await supabase.rpc('run_fraud_rules', {
      p_establishment_id: settings.establishment_id,
    });

    logInfo(ctx, 'ingest_completed', {
      establishment_id: settings.establishment_id,
      event_key: eventKey,
      deduplicated: false,
      duration_ms: durationMs(ctx),
    });
    return json({ ok: true, deduplicated: false, event_key: eventKey, camera_id: cameraId, detected_at: detectedAt, request_id: ctx.request_id });
  } catch (err: any) {
    if (err instanceof InvalidRequestError) {
      return json({ error: err.message, request_id: ctx.request_id }, 400);
    }
    logError(ctx, 'request_failed', { error: String(err?.message ?? err), duration_ms: durationMs(ctx) });
    return json({ error: 'internal_error', request_id: ctx.request_id }, 500);
  }
});

class InvalidRequestError extends Error {}
interface LogContext {
  request_id: string;
  function_name: string;
  path: string;
  method: string;
  started_at_ms: number;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function readJsonBody(req: Request): Promise<Record<string, any>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new InvalidRequestError('invalid_json_payload');
    }
    return body as Record<string, any>;
  } catch {
    throw new InvalidRequestError('invalid_json_payload');
  }
}

function isIsoDate(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return !Number.isNaN(Date.parse(value));
}

async function buildEventKey(payload: Record<string, unknown>): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return `cash:${toHex(hash)}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createLogContext(req: Request, functionName: string): LogContext {
  return {
    request_id: crypto.randomUUID(),
    function_name: functionName,
    path: new URL(req.url).pathname,
    method: req.method,
    started_at_ms: Date.now(),
  };
}

function logInfo(ctx: LogContext, event: string, data: Record<string, unknown> = {}) {
  console.info(JSON.stringify({
    level: 'info',
    event,
    request_id: ctx.request_id,
    function_name: ctx.function_name,
    path: ctx.path,
    method: ctx.method,
    ...data,
  }));
}

function logError(ctx: LogContext, event: string, data: Record<string, unknown> = {}) {
  console.error(JSON.stringify({
    level: 'error',
    event,
    request_id: ctx.request_id,
    function_name: ctx.function_name,
    path: ctx.path,
    method: ctx.method,
    ...data,
  }));
}

function durationMs(ctx: LogContext): number {
  return Date.now() - ctx.started_at_ms;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

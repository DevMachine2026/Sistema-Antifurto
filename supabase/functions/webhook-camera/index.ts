import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  const ctx = createLogContext(req, 'webhook-camera');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    logInfo(ctx, 'request_rejected', { reason: 'method_not_allowed' });
    return json({ error: 'method_not_allowed', request_id: ctx.request_id }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = getBearerToken(req);
    if (!token) {
      logInfo(ctx, 'auth_failed', { reason: 'missing_bearer_token' });
      return json({ error: 'missing_bearer_token', request_id: ctx.request_id }, 401);
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('establishment_id')
      .eq('webhook_token', token)
      .single();

    if (!settings) {
      logInfo(ctx, 'auth_failed', { reason: 'invalid_bearer_token' });
      return json({ error: 'invalid_bearer_token', request_id: ctx.request_id }, 401);
    }

    const body = await readJsonBody(req);

    // Suporta formato Intelbras ISAPI e formato genérico
    let cameraId: string, countIn: number, countOut: number,
        peopleInside: number, recordedAt: string;

    if (body.peopleCounting) {
      // Formato Intelbras ISAPI
      cameraId     = body.channelName ?? body.ipAddress ?? 'cam-entrada';
      countIn      = Number(body.peopleCounting.enter  ?? 0);
      countOut     = Number(body.peopleCounting.exit   ?? 0);
      peopleInside = Number(body.peopleCounting.people ?? countIn - countOut);
      recordedAt   = body.dateTime ?? new Date().toISOString();
    } else {
      // Formato genérico (Raspberry Pi ou outro)
      cameraId     = body.camera_id ?? 'cam-entrada';
      countIn      = Number(body.count_in      ?? 0);
      countOut     = Number(body.count_out     ?? 0);
      peopleInside = Number(body.people_inside ?? countIn - countOut);
      recordedAt   = body.recorded_at ?? new Date().toISOString();
    }

    if (!cameraId || typeof cameraId !== 'string') {
      return json({ error: 'invalid_camera_id', request_id: ctx.request_id }, 400);
    }

    if (![countIn, countOut, peopleInside].every(Number.isFinite)) {
      return json({ error: 'invalid_count_values', request_id: ctx.request_id }, 400);
    }

    if (countIn < 0 || countOut < 0 || peopleInside < 0) {
      return json({ error: 'negative_count_values_not_allowed', request_id: ctx.request_id }, 400);
    }

    if (!isIsoDate(recordedAt)) {
      return json({ error: 'invalid_recorded_at', request_id: ctx.request_id }, 400);
    }

    const normalizedCameraId = cameraId.trim();
    const eventKey = String(
      body.event_id ??
      body.source_event_id ??
      await buildEventKey({
        camera_id: normalizedCameraId,
        count_in: countIn,
        count_out: countOut,
        people_inside: peopleInside,
        recorded_at: recordedAt,
      })
    );

    const { data: existing } = await supabase
      .from('people_count_events')
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
      return json({ ok: true, deduplicated: true, event_key: eventKey, people_inside: peopleInside, request_id: ctx.request_id });
    }

    const { error } = await supabase.from('people_count_events').insert({
      establishment_id: settings.establishment_id,
      external_event_key: eventKey,
      camera_id:    normalizedCameraId,
      count_in:     countIn,
      count_out:    countOut,
      people_inside: peopleInside,
      recorded_at:  recordedAt,
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
    return json({ ok: true, deduplicated: false, event_key: eventKey, people_inside: peopleInside, request_id: ctx.request_id });
  } catch (err: any) {
    if (err instanceof InvalidRequestError) {
      logInfo(ctx, 'request_invalid', { reason: err.message, duration_ms: durationMs(ctx) });
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
  return `camera:${toHex(hash)}`;
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

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { resolveEstablishmentId, sanitizeCameraId } from '../_shared/webhookAuth.ts';
import { dispatchAlertNotifications } from '../_shared/notify.ts';
import { evidenceB64TooLarge } from '../_shared/evidenceLimits.ts';
import { createLogContext, durationMs, logError, logInfo } from '../_shared/log.ts';

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

  if (!(await checkRateLimit('webhook-camera', req, 120))) {
    return json({ error: 'rate_limit_exceeded', request_id: ctx.request_id }, 429);
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

    const settings = await resolveEstablishmentId(supabase, token);
    if (!settings) {
      logInfo(ctx, 'auth_failed', { reason: 'invalid_bearer_token' });
      return json({ error: 'invalid_bearer_token', request_id: ctx.request_id }, 401);
    }

    const body = await readJsonBody(req);

    if (evidenceB64TooLarge(body.evidence_image)) {
      return json({ error: 'evidence_too_large', request_id: ctx.request_id }, 413);
    }

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

    const normalizedCameraId = sanitizeCameraId(cameraId);
    if (!normalizedCameraId) {
      return json({ error: 'invalid_camera_id', request_id: ctx.request_id }, 400);
    }
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

    // Salva evidência visual no Storage (best-effort — não bloqueia o evento)
    let evidenceUrl: string | null = null;
    const evidenceB64 = typeof body.evidence_image === 'string' ? body.evidence_image : null;
    if (evidenceB64) {
      try {
        const bytes = Uint8Array.from(atob(evidenceB64), (c) => c.charCodeAt(0));
        const fileName = `${settings.establishment_id}/${normalizedCameraId}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: false });
        if (!uploadError) {
          evidenceUrl = fileName;
        }
      } catch { /* falha de upload não impede o evento */ }
    }

    const { error } = await supabase.from('people_count_events').insert({
      establishment_id: settings.establishment_id,
      external_event_key: eventKey,
      camera_id:    normalizedCameraId,
      count_in:     countIn,
      count_out:    countOut,
      people_inside: peopleInside,
      recorded_at:  recordedAt,
      ...(evidenceUrl ? { evidence_storage_path: evidenceUrl, evidence_url: evidenceUrl } : {}),
    });

    if (error) throw error;

    // Garante que existe um registro em cameras com este camera_id.
    // Se a câmera já existe, só atualiza status e last_event_at (preserva nome personalizado).
    // Isso resolve o mismatch entre camera_id auto-registrado (ONVIF) e o que chega nos eventos.
    const { data: existingCam } = await supabase
      .from('cameras')
      .select('id')
      .eq('establishment_id', settings.establishment_id)
      .eq('camera_id', normalizedCameraId)
      .maybeSingle();

    if (existingCam) {
      await supabase.from('cameras')
        .update({ status: 'online', last_event_at: recordedAt })
        .eq('id', existingCam.id);
    } else {
      await supabase.from('cameras').insert({
        establishment_id: settings.establishment_id,
        name: `Câmera ${normalizedCameraId}`,
        camera_id: normalizedCameraId,
        camera_type: 'people_counting',
        status: 'online',
        last_event_at: recordedAt,
      }).then(() => {}).catch(() => {}); // ignora conflito de corrida
    }

    const { data: newAlerts } = await supabase.rpc('run_fraud_rules', {
      p_establishment_id: settings.establishment_id,
    });

    if (newAlerts && newAlerts.length > 0) {
      dispatchAlertNotifications(settings.establishment_id, newAlerts).catch(() => {});
    }

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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

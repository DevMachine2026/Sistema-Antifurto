// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { resolveEstablishmentId, sanitizeCameraId } from '../_shared/webhookAuth.ts';
import { dispatchAlertNotifications } from '../_shared/notify.ts';
import { evidenceB64TooLarge } from '../_shared/evidenceLimits.ts';
import { createLogContext, durationMs, logError, logInfo, logWarn } from '../_shared/log.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  const ctx = createLogContext(req, 'webhook-cash');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', request_id: ctx.request_id }, 405);
  if (!(await checkRateLimit('webhook-cash', req, 30))) {
    return json({ error: 'rate_limit_exceeded', request_id: ctx.request_id }, 429);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = getBearerToken(req);
    if (!token) return json({ error: 'missing_bearer_token', request_id: ctx.request_id }, 401);

    const settings = await resolveEstablishmentId(supabase, token);
    if (!settings) return json({ error: 'invalid_bearer_token', request_id: ctx.request_id }, 401);

    const body = await readJsonBody(req);

    if (evidenceB64TooLarge(body.evidence_image)) {
      return json({ error: 'evidence_too_large', request_id: ctx.request_id }, 413);
    }

    // Payload esperado do Raspberry Pi / agente:
    // { camera_id, detected_at, confidence, window_minutes?, evidence_image? (base64 JPEG) }
    const cameraIdRaw  = String(body.camera_id ?? 'cam-caixa');
    const cameraId     = sanitizeCameraId(cameraIdRaw) ?? sanitizeCameraId('cam-caixa');
    if (!cameraId) return json({ error: 'invalid_camera_id', request_id: ctx.request_id }, 400);
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

    // Upload de evidência visual (POS-Video Sync)
    let evidenceUrl: string | null = null;
    if (typeof body.evidence_image === 'string' && body.evidence_image.length > 0) {
      try {
        const imgBytes = Uint8Array.from(atob(body.evidence_image), (c) => c.charCodeAt(0));
        const storagePath = `${settings.establishment_id}/cash_${eventKey}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('evidence')
          .upload(storagePath, imgBytes, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) {
          evidenceUrl = storagePath;
        } else {
          logWarn(ctx, 'evidence_upload_failed', { error: upErr.message });
        }
      } catch (imgErr: any) {
        logWarn(ctx, 'evidence_decode_failed', { error: String(imgErr?.message ?? imgErr) });
      }
    }

    const { error } = await supabase.from('cash_payment_events').insert({
      establishment_id:   settings.establishment_id,
      external_event_key: eventKey,
      camera_id:          cameraId,
      detected_at:        detectedAt,
      window_minutes:     windowMin,
      ...(evidenceUrl && { evidence_storage_path: evidenceUrl, evidence_url: evidenceUrl }),
    });

    if (error) throw error;

    const { data: newAlerts } = await supabase.rpc('run_fraud_rules', {
      p_establishment_id: settings.establishment_id,
    });

    if (newAlerts && newAlerts.length > 0) {
      dispatchAlertNotifications(settings.establishment_id, newAlerts).catch(() => {});
    }

    logInfo(ctx, 'ingest_completed', {
      establishment_id: settings.establishment_id,
      event_key: eventKey,
      has_evidence: !!evidenceUrl,
      deduplicated: false,
      duration_ms: durationMs(ctx),
    });
    return json({ ok: true, deduplicated: false, event_key: eventKey, camera_id: cameraId, detected_at: detectedAt, has_evidence: !!evidenceUrl, request_id: ctx.request_id });
  } catch (err: any) {
    if (err instanceof InvalidRequestError) {
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
  return `cash:${toHex(hash)}`;
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

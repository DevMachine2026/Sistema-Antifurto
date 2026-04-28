import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Token ausente' }, 401);

    const { data: settings } = await supabase
      .from('settings')
      .select('establishment_id')
      .eq('webhook_token', token)
      .single();

    if (!settings) return json({ error: 'Token inválido' }, 401);

    const body = await req.json();

    // Payload esperado do Raspberry Pi:
    // { camera_id, detected_at, confidence, window_minutes? }
    const cameraId     = body.camera_id    ?? 'cam-caixa';
    const detectedAt   = body.detected_at  ?? new Date().toISOString();
    const windowMin    = Number(body.window_minutes ?? 15);
    const confidence   = Number(body.confidence    ?? 1.0);

    // Ignora detecções com baixa confiança
    if (confidence < 0.7) {
      return json({ ok: true, skipped: true, reason: 'confidence_too_low' });
    }

    const { error } = await supabase.from('cash_payment_events').insert({
      establishment_id: settings.establishment_id,
      camera_id:        cameraId,
      detected_at:      detectedAt,
      window_minutes:   windowMin,
    });

    if (error) throw error;

    await supabase.rpc('run_fraud_rules', {
      p_establishment_id: settings.establishment_id,
    });

    return json({ ok: true, camera_id: cameraId, detected_at: detectedAt });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

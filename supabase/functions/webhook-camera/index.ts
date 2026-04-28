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

    // Autenticação via Bearer token
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Token ausente' }, 401);

    const { data: settings } = await supabase
      .from('settings')
      .select('establishment_id')
      .eq('webhook_token', token)
      .single();

    if (!settings) return json({ error: 'Token inválido' }, 401);

    const body = await req.json();

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

    const { error } = await supabase.from('people_count_events').insert({
      establishment_id: settings.establishment_id,
      camera_id:    cameraId,
      count_in:     countIn,
      count_out:    countOut,
      people_inside: peopleInside,
      recorded_at:  recordedAt,
    });

    if (error) throw error;

    await supabase.rpc('run_fraud_rules', {
      p_establishment_id: settings.establishment_id,
    });

    return json({ ok: true, people_inside: peopleInside });
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

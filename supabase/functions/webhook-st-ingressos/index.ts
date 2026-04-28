import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// Mapeamento de métodos de pagamento ST Ingressos → sistema
const METHOD_MAP: Record<string, string> = {
  'cartao_credito': 'credit',  'credito': 'credit',   'credit': 'credit',
  'cartao_debito':  'debit',   'debito':  'debit',    'debit':  'debit',
  'pix': 'pix',
  'dinheiro': 'cash', 'especie': 'cash', 'cash': 'cash',
};

function mapMethod(raw: string): string {
  const normalized = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return METHOD_MAP[normalized] ?? 'credit';
}

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

    // Suporta payload único ou array de transações
    const items: any[] = Array.isArray(body) ? body : [body];

    // Cria o batch de importação
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .insert({
        establishment_id: settings.establishment_id,
        source:           'st_ingressos',
        filename:         `ST_API_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`,
        rows_total:       items.length,
        rows_imported:    items.length,
        rows_failed:      0,
        status:           'done',
        imported_by:      'webhook-st-ingressos',
      })
      .select()
      .single();

    if (batchErr) throw batchErr;

    // Insere as transações
    const txRows = items.map(item => ({
      establishment_id: settings.establishment_id,
      batch_id:         batch.id,
      source:           'st_ingressos',
      amount:           Number(item.amount ?? item.valor ?? 0),
      payment_method:   mapMethod(String(item.payment_method ?? item.modalidade ?? item.tipo ?? 'cash')),
      operator_id:      item.operator_id ?? item.operador ?? null,
      occurred_at:      item.occurred_at ?? item.data_hora ?? new Date().toISOString(),
      imported_at:      new Date().toISOString(),
      raw_data:         item,
    }));

    const { error: txErr } = await supabase.from('transactions').insert(txRows);
    if (txErr) throw txErr;

    await supabase.rpc('run_fraud_rules', {
      p_establishment_id: settings.establishment_id,
    });

    return json({ ok: true, batch_id: batch.id, imported: txRows.length });
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

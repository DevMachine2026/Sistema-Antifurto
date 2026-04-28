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
  const ctx = createLogContext(req, 'webhook-st-ingressos');
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

    // Suporta payload único ou array de transações
    const items: any[] = Array.isArray(body) ? body : [body];
    if (items.length === 0) return json({ error: 'empty_payload', request_id: ctx.request_id }, 400);
    if (items.length > 1000) return json({ error: 'payload_too_large', request_id: ctx.request_id }, 413);

    const candidateRows = await Promise.all(items.map(async (item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new InvalidRequestError(`invalid_item_at_index_${index}`);
      }

      const amount = Number(item.amount ?? item.valor);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new InvalidRequestError(`invalid_amount_at_index_${index}`);
      }

      const occurredAt = String(item.occurred_at ?? item.data_hora ?? new Date().toISOString());
      if (!isIsoDate(occurredAt)) {
        throw new InvalidRequestError(`invalid_occurred_at_at_index_${index}`);
      }

      const methodRaw = String(item.payment_method ?? item.modalidade ?? item.tipo ?? 'cash');
      const operatorId = item.operator_id ?? item.operador ?? null;
      const eventKey = String(
        item.event_id ??
        item.source_event_id ??
        item.transaction_id ??
        await buildEventKey({
          amount,
          method: methodRaw,
          operator_id: operatorId,
          occurred_at: occurredAt,
        })
      );

      return {
        event_key:        eventKey,
        source:           'st_ingressos',
        amount,
        payment_method:   mapMethod(methodRaw),
        operator_id:      operatorId,
        occurred_at:      occurredAt,
        raw_data:         item,
      };
    }));

    // Remove duplicados dentro do mesmo payload
    const deduplicatedMap = new Map<string, typeof candidateRows[number]>();
    for (const row of candidateRows) {
      if (!deduplicatedMap.has(row.event_key)) {
        deduplicatedMap.set(row.event_key, row);
      }
    }
    const deduplicatedRows = Array.from(deduplicatedMap.values());

    const existingKeys = await fetchExistingEventKeys(
      supabase,
      settings.establishment_id,
      deduplicatedRows.map((row) => row.event_key)
    );

    const newRows = deduplicatedRows.filter((row) => !existingKeys.has(row.event_key));

    if (newRows.length === 0) {
      logInfo(ctx, 'ingest_deduplicated', {
        establishment_id: settings.establishment_id,
        deduplicated: true,
        received: items.length,
        imported: 0,
        duration_ms: durationMs(ctx),
      });
      return json({
        ok: true,
        deduplicated: true,
        imported: 0,
        skipped_duplicates: items.length,
        request_id: ctx.request_id,
      });
    }

    // Cria o batch de importação apenas quando houver novas transações
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .insert({
        establishment_id: settings.establishment_id,
        source:           'st_ingressos',
        filename:         `ST_API_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`,
        rows_total:       items.length,
        rows_imported:    newRows.length,
        rows_failed:      items.length - newRows.length,
        status:           'done',
        imported_by:      'webhook-st-ingressos',
      })
      .select()
      .single();

    if (batchErr) throw batchErr;

    const now = new Date().toISOString();
    const txRows = newRows.map((row) => ({
      establishment_id: settings.establishment_id,
      batch_id:         batch.id,
      source:           row.source,
      amount:           row.amount,
      payment_method:   row.payment_method,
      operator_id:      row.operator_id,
      occurred_at:      row.occurred_at,
      imported_at:      now,
      external_event_key: row.event_key,
      raw_data:         row.raw_data,
    }));

    const { error: txErr } = await supabase.from('transactions').insert(txRows);
    if (txErr) throw txErr;

    await supabase.rpc('run_fraud_rules', {
      p_establishment_id: settings.establishment_id,
    });

    logInfo(ctx, 'ingest_completed', {
      establishment_id: settings.establishment_id,
      deduplicated: false,
      received: items.length,
      imported: txRows.length,
      skipped_duplicates: items.length - txRows.length,
      duration_ms: durationMs(ctx),
    });
    return json({
      ok: true,
      deduplicated: false,
      batch_id: batch.id,
      imported: txRows.length,
      skipped_duplicates: items.length - txRows.length,
      request_id: ctx.request_id,
    });
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

async function readJsonBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    throw new InvalidRequestError('invalid_json_payload');
  }
}

function isIsoDate(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return !Number.isNaN(Date.parse(value));
}

async function fetchExistingEventKeys(
  supabase: ReturnType<typeof createClient>,
  establishmentId: string,
  keys: string[],
): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const uniqueKeys = Array.from(new Set(keys));
  const { data, error } = await supabase
    .from('transactions')
    .select('external_event_key')
    .eq('establishment_id', establishmentId)
    .eq('source', 'st_ingressos')
    .in('external_event_key', uniqueKeys);

  if (error) throw error;

  return new Set((data ?? [])
    .map((row: { external_event_key: string | null }) => row.external_event_key)
    .filter((key): key is string => !!key));
}

async function buildEventKey(payload: Record<string, unknown>): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return `st:${toHex(hash)}`;
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

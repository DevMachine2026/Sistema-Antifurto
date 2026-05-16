-- POS × Vídeo: evidência visual nos eventos de caixa + função de timeline

ALTER TABLE cash_payment_events
  ADD COLUMN IF NOT EXISTS evidence_url text;

-- Função de timeline: junta transações com o evento de caixa mais próximo
-- e adiciona eventos de caixa órfãos (caixa aberto sem venda registrada)
CREATE OR REPLACE FUNCTION get_pos_timeline(
  p_establishment_id uuid,
  p_from             timestamptz DEFAULT now() - interval '24 hours',
  p_to               timestamptz DEFAULT now()
)
RETURNS TABLE(
  row_type          text,
  transaction_id    uuid,
  occurred_at       timestamptz,
  amount            numeric,
  payment_method    text,
  operator_id       text,
  source            text,
  cash_event_id     uuid,
  cash_detected_at  timestamptz,
  camera_id         text,
  evidence_url      text,
  time_diff_seconds float8,
  sync_status       text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- 1. Transações com evento de caixa mais próximo (dentro de ±10 min)
  SELECT
    'transaction'::text                                                     AS row_type,
    t.id                                                                    AS transaction_id,
    t.occurred_at::timestamptz                                              AS occurred_at,
    t.amount                                                                AS amount,
    t.payment_method::text                                                  AS payment_method,
    t.operator_id                                                           AS operator_id,
    t.source::text                                                          AS source,
    cpe.id                                                                  AS cash_event_id,
    cpe.detected_at                                                         AS cash_detected_at,
    cpe.camera_id                                                           AS camera_id,
    cpe.evidence_url                                                        AS evidence_url,
    ABS(EXTRACT(EPOCH FROM (t.occurred_at::timestamptz - cpe.detected_at)))::float8 AS time_diff_seconds,
    CASE
      WHEN cpe.id IS NOT NULL     THEN 'matched'
      WHEN t.payment_method = 'cash' THEN 'no_cash_evidence'
      ELSE                             'card_ok'
    END                                                                     AS sync_status
  FROM transactions t
  LEFT JOIN LATERAL (
    SELECT c.*
    FROM cash_payment_events c
    WHERE c.establishment_id = t.establishment_id
      AND c.detected_at BETWEEN t.occurred_at::timestamptz - interval '10 minutes'
                             AND t.occurred_at::timestamptz + interval '10 minutes'
    ORDER BY ABS(EXTRACT(EPOCH FROM (t.occurred_at::timestamptz - c.detected_at)))
    LIMIT 1
  ) cpe ON true
  WHERE t.establishment_id = p_establishment_id
    AND t.occurred_at::timestamptz BETWEEN p_from AND p_to

  UNION ALL

  -- 2. Eventos de caixa sem transação correspondente (risco máximo)
  SELECT
    'orphan_cash'::text,
    NULL, NULL, NULL, NULL, NULL, NULL,
    c.id,
    c.detected_at,
    c.camera_id,
    c.evidence_url,
    NULL,
    'orphan_cash'::text
  FROM cash_payment_events c
  WHERE c.establishment_id = p_establishment_id
    AND c.detected_at BETWEEN p_from AND p_to
    AND NOT EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.establishment_id = p_establishment_id
        AND t.occurred_at::timestamptz
              BETWEEN c.detected_at - interval '10 minutes'
                  AND c.detected_at + interval '10 minutes'
    )

  ORDER BY COALESCE(occurred_at, cash_detected_at) DESC;
$$;

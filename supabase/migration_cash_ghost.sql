-- =============================================================
-- MIGRATION: cash_payment_events + Regra R05 (Cash Ghost)
-- Executar no SQL Editor do Supabase
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. NOVA TABELA: cash_payment_events
--    Registra cada detecção de pagamento em espécie pela câmera
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_payment_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id  uuid        NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  camera_id         text        NOT NULL,
  detected_at       timestamptz NOT NULL,
  window_minutes    integer     NOT NULL DEFAULT 15,
  matched           boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cash_payment_events IS
  'Eventos de detecção de cédulas pela câmera no caixa. matched=true indica que foi encontrada venda em dinheiro correspondente no ST Ingressos.';

ALTER TABLE cash_payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cash_payment_events"
  ON cash_payment_events USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cash_events_establishment
  ON cash_payment_events(establishment_id);
CREATE INDEX IF NOT EXISTS idx_cash_events_detected_at
  ON cash_payment_events(establishment_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_events_unmatched
  ON cash_payment_events(establishment_id, detected_at DESC)
  WHERE matched = false;


-- ─────────────────────────────────────────────────────────────
-- 2. ATUALIZA O CHECK de alerts.type para incluir 'cash_ghost'
-- ─────────────────────────────────────────────────────────────
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check CHECK (type IN (
  'crowd_no_sales',
  'card_gap',
  'dead_window',
  'velocity_spike',
  'shift_missing_closing',
  'operator_void_abuse',
  'weight_label_mismatch',
  'cash_ghost'
));


-- ─────────────────────────────────────────────────────────────
-- 3. ATUALIZA run_fraud_rules com R05
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_fraud_rules(p_establishment_id uuid)
RETURNS TABLE(alert_type text, severity text, description text)
LANGUAGE plpgsql AS $$
DECLARE
  v_settings         settings%ROWTYPE;
  v_last_people      people_count_events%ROWTYPE;
  v_recent_sales     integer;
  v_pagbank_total    numeric;
  v_st_total         numeric;
  v_gap              numeric;
  v_window_start     timestamptz;
  v_cash             cash_payment_events%ROWTYPE;
  v_has_cash_sale    boolean;
BEGIN
  SELECT * INTO v_settings
  FROM settings WHERE establishment_id = p_establishment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configurações não encontradas para establishment %', p_establishment_id;
  END IF;

  -- ── R01: Salão Cheio, Caixa Vazio ──────────────────────────
  SELECT * INTO v_last_people
  FROM people_count_events
  WHERE establishment_id = p_establishment_id
  ORDER BY recorded_at DESC LIMIT 1;

  IF FOUND AND v_last_people.people_inside > v_settings.r01_min_people THEN
    v_window_start := now() - (v_settings.r01_window_minutes || ' minutes')::interval;

    SELECT COUNT(*) INTO v_recent_sales
    FROM transactions
    WHERE establishment_id = p_establishment_id
      AND source = 'st_ingressos'
      AND occurred_at >= v_window_start;

    IF v_recent_sales = 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM alerts
        WHERE establishment_id = p_establishment_id
          AND type = 'crowd_no_sales' AND resolved = false
          AND created_at >= now() - interval '2 hours'
      ) THEN
        INSERT INTO alerts (establishment_id, type, severity, description, context)
        VALUES (
          p_establishment_id, 'crowd_no_sales', 'high',
          format('R01: %s pessoas no salão sem vendas nos últimos %s min.',
                 v_last_people.people_inside, v_settings.r01_window_minutes),
          jsonb_build_object(
            'people_inside',   v_last_people.people_inside,
            'window_minutes',  v_settings.r01_window_minutes,
            'camera_id',       v_last_people.camera_id
          )
        );
        RETURN QUERY SELECT 'crowd_no_sales'::text, 'high'::text,
          format('R01: %s pessoas sem vendas.', v_last_people.people_inside);
      END IF;
    END IF;
  END IF;

  -- ── R02: Gap Financeiro ─────────────────────────────────────
  SELECT COALESCE(SUM(amount), 0) INTO v_pagbank_total
  FROM transactions
  WHERE establishment_id = p_establishment_id AND source = 'pagbank';

  SELECT COALESCE(SUM(amount), 0) INTO v_st_total
  FROM transactions
  WHERE establishment_id = p_establishment_id AND source = 'st_ingressos';

  v_gap := ABS(v_pagbank_total - v_st_total);

  IF v_gap > v_settings.r02_gap_threshold THEN
    IF NOT EXISTS (
      SELECT 1 FROM alerts
      WHERE establishment_id = p_establishment_id
        AND type = 'card_gap' AND resolved = false
        AND created_at >= now() - interval '2 hours'
    ) THEN
      INSERT INTO alerts (establishment_id, type, severity, description, context)
      VALUES (
        p_establishment_id, 'card_gap', 'high',
        format('R02: Divergência de %s entre PagBank e Bilheteria.',
               to_char(v_gap, 'FM"R$"999G999D99')),
        jsonb_build_object(
          'pagbank_total', v_pagbank_total,
          'st_total',      v_st_total,
          'diff',          v_pagbank_total - v_st_total,
          'threshold',     v_settings.r02_gap_threshold
        )
      );
      RETURN QUERY SELECT 'card_gap'::text, 'high'::text,
        format('R02: Gap de R$ %s.', v_gap);
    END IF;
  END IF;

  -- ── R05: Cash Ghost — espécie sem lançamento ───────────────
  FOR v_cash IN
    SELECT * FROM cash_payment_events
    WHERE establishment_id = p_establishment_id
      AND matched = false
      AND detected_at >= now() - interval '4 hours'
    ORDER BY detected_at ASC
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM transactions
      WHERE establishment_id = p_establishment_id
        AND source = 'st_ingressos'
        AND payment_method = 'cash'
        AND occurred_at BETWEEN
              v_cash.detected_at - (v_cash.window_minutes || ' minutes')::interval
          AND v_cash.detected_at + (v_cash.window_minutes || ' minutes')::interval
    ) INTO v_has_cash_sale;

    IF v_has_cash_sale THEN
      UPDATE cash_payment_events SET matched = true WHERE id = v_cash.id;
    ELSE
      UPDATE cash_payment_events SET matched = false WHERE id = v_cash.id;

      IF NOT EXISTS (
        SELECT 1 FROM alerts
        WHERE establishment_id = p_establishment_id
          AND type = 'cash_ghost' AND resolved = false
          AND context->>'cash_event_id' = v_cash.id::text
      ) THEN
        INSERT INTO alerts (establishment_id, type, severity, description, context)
        VALUES (
          p_establishment_id, 'cash_ghost', 'high',
          format('R05: Pagamento em espécie detectado às %s sem lançamento no ST Ingressos.',
                 to_char(v_cash.detected_at AT TIME ZONE 'America/Fortaleza', 'HH24:MI')),
          jsonb_build_object(
            'cash_event_id',  v_cash.id,
            'detected_at',    v_cash.detected_at,
            'camera_id',      v_cash.camera_id,
            'window_minutes', v_cash.window_minutes
          )
        );
        RETURN QUERY SELECT 'cash_ghost'::text, 'high'::text,
          format('R05: Espécie sem lançamento detectada às %s.',
                 to_char(v_cash.detected_at AT TIME ZONE 'America/Fortaleza', 'HH24:MI'));
      END IF;
    END IF;
  END LOOP;

END;
$$;

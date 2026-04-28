-- MIGRATION: R01 com suporte a múltiplas câmeras de contagem
-- ─────────────────────────────────────────────────────────────
-- Contexto: o estabelecimento opera com 2 câmeras Intelbras para
-- contagem de pessoas em zonas distintas (cam-area-01, cam-area-02)
-- e 1 câmera Raspberry Pi na bilheteria para detecção de espécie
-- (cam-caixa). O R01 agora soma o leitura mais recente de cada
-- câmera de contagem, evitando falso negativo quando uma câmera
-- reporta antes da outra.
-- ─────────────────────────────────────────────────────────────

-- Atualiza run_fraud_rules com R01 multi-câmera (R02 e R05 inalterados)
CREATE OR REPLACE FUNCTION run_fraud_rules(p_establishment_id uuid)
RETURNS TABLE(alert_type text, severity text, description text)
LANGUAGE plpgsql AS $$
DECLARE
  v_settings         settings%ROWTYPE;
  v_total_people     integer;
  v_cameras_json     jsonb;
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
  -- Soma o valor mais recente de CADA câmera de contagem.
  -- DISTINCT ON garante uma linha por camera_id (a mais recente).
  -- Ignora leituras com mais de 2h para não contar câmera offline.
  SELECT
    COALESCE(SUM(latest.people_inside), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'camera_id',    latest.camera_id,
      'people',       latest.people_inside,
      'recorded_at',  latest.recorded_at
    )), '[]'::jsonb)
  INTO v_total_people, v_cameras_json
  FROM (
    SELECT DISTINCT ON (camera_id)
      camera_id, people_inside, recorded_at
    FROM people_count_events
    WHERE establishment_id = p_establishment_id
      AND recorded_at >= now() - interval '2 hours'
    ORDER BY camera_id, recorded_at DESC
  ) latest;

  IF v_total_people > v_settings.r01_min_people THEN
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
                 v_total_people, v_settings.r01_window_minutes),
          jsonb_build_object(
            'people_inside',  v_total_people,
            'window_minutes', v_settings.r01_window_minutes,
            'cameras',        v_cameras_json
          )
        );
        RETURN QUERY SELECT 'crowd_no_sales'::text, 'high'::text,
          format('R01: %s pessoas no salão sem vendas.', v_total_people);
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

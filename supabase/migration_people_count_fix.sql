-- migration_people_count_fix.sql
-- Corrige run_fraud_rules:
--   1. R01 usa apenas eventos RECENTES (dentro da janela r01_window_minutes)
--   2. R01 agrega people_inside do ÚLTIMO evento de CADA câmera (sum por câmera)
--      → correto para múltiplas câmeras em zonas distintas
-- Rodar uma vez no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION run_fraud_rules(p_establishment_id uuid)
RETURNS TABLE(alert_type text, severity text, description text) LANGUAGE plpgsql AS $$
DECLARE
  v_settings              settings%ROWTYPE;
  v_total_people_inside   integer  := 0;
  v_recent_event_at       timestamptz;
  v_recent_sales_count    integer;
  v_pagbank_total         numeric;
  v_st_total              numeric;
  v_gap                   numeric;
  v_window_start          timestamptz;
BEGIN
  SELECT * INTO v_settings
  FROM settings
  WHERE establishment_id = p_establishment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configurações não encontradas para establishment %', p_establishment_id;
  END IF;

  -- Janela de monitoramento (usada por R01 e pela verificação de vendas)
  v_window_start := now() - (v_settings.r01_window_minutes || ' minutes')::interval;

  -- ── R01: Lotação sem Vendas ─────────────────────────────────────────────────
  -- Pega o evento mais recente de CADA câmera dentro da janela, soma people_inside.
  -- Câmeras com dados mais velhos que a janela são ignoradas (agente offline = sem dado).
  SELECT
    COALESCE(SUM(latest.people_inside), 0),
    MAX(latest.recorded_at)
  INTO v_total_people_inside, v_recent_event_at
  FROM (
    SELECT DISTINCT ON (camera_id)
      camera_id, people_inside, recorded_at
    FROM people_count_events
    WHERE establishment_id = p_establishment_id
      AND recorded_at >= v_window_start
    ORDER BY camera_id, recorded_at DESC
  ) latest;

  -- Só dispara se tiver dados recentes E o salão estiver acima do limiar
  IF v_recent_event_at IS NOT NULL AND v_total_people_inside > v_settings.r01_min_people THEN

    SELECT COUNT(*) INTO v_recent_sales_count
    FROM transactions
    WHERE establishment_id = p_establishment_id
      AND source = 'st_ingressos'
      AND occurred_at >= v_window_start;

    IF v_recent_sales_count = 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM alerts
        WHERE establishment_id = p_establishment_id
          AND type = 'crowd_no_sales'
          AND resolved = false
          AND created_at >= now() - interval '2 hours'
      ) THEN
        INSERT INTO alerts (establishment_id, type, severity, description, context)
        VALUES (
          p_establishment_id,
          'crowd_no_sales',
          'high',
          format('R01: %s pessoas no salão sem vendas nos últimos %s min.',
                 v_total_people_inside, v_settings.r01_window_minutes),
          jsonb_build_object(
            'people_inside',   v_total_people_inside,
            'window_minutes',  v_settings.r01_window_minutes,
            'window_start',    v_window_start
          )
        );
        RETURN QUERY SELECT
          'crowd_no_sales'::text,
          'high'::text,
          format('R01: %s pessoas sem vendas.', v_total_people_inside);
      END IF;
    END IF;
  END IF;

  -- ── R02: Gap Financeiro ─────────────────────────────────────────────────────
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
        AND type = 'card_gap'
        AND resolved = false
        AND created_at >= now() - interval '2 hours'
    ) THEN
      INSERT INTO alerts (establishment_id, type, severity, description, context)
      VALUES (
        p_establishment_id,
        'card_gap',
        'high',
        format('R02: Divergência de %s entre PagBank e Bilheteria.',
               to_char(v_gap, 'FM"R$"999G999D99')),
        jsonb_build_object(
          'pagbank_total', v_pagbank_total,
          'st_total',      v_st_total,
          'diff',          v_pagbank_total - v_st_total,
          'threshold',     v_settings.r02_gap_threshold
        )
      );
      RETURN QUERY SELECT
        'card_gap'::text,
        'high'::text,
        format('R02: Gap de R$ %s.', v_gap);
    END IF;
  END IF;

END;
$$;

-- =============================================================
-- TESTES DE INTEGRAÇÃO: Motor de Regras (R01, R02, R05)
-- =============================================================
-- Como usar:
-- 1) Execute schema + migrations antes deste arquivo.
-- 2) Rode este script no SQL Editor do Supabase.
-- 3) Se tudo passar, o script retorna "ALL_RULE_TESTS_PASSED".
-- 4) Tudo roda em TRANSACTION com ROLLBACK (sem persistir dados).

BEGIN;

DO $$
DECLARE
  v_establishment_id uuid := gen_random_uuid();
  v_batch_st uuid := gen_random_uuid();
  v_batch_pag uuid := gen_random_uuid();
  v_cash_event_unmatched uuid := gen_random_uuid();
  v_cash_event_matched uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_count integer;
BEGIN
  -- Setup mínimo do tenant isolado para teste
  INSERT INTO establishments (id, name, slug, active)
  VALUES (
    v_establishment_id,
    'Tenant Teste Regras',
    'tenant-teste-regras-' || substr(replace(v_establishment_id::text, '-', ''), 1, 12),
    true
  );

  INSERT INTO settings (
    establishment_id,
    r01_min_people,
    r01_window_minutes,
    r02_gap_threshold,
    strict_audit_mode
  )
  VALUES (
    v_establishment_id,
    30,
    30,
    200.00,
    false
  );

  -- ===========================================================
  -- R01: Salão cheio sem vendas recentes de ST
  -- ===========================================================
  INSERT INTO people_count_events (
    establishment_id,
    camera_id,
    count_in,
    count_out,
    people_inside,
    recorded_at
  )
  VALUES (
    v_establishment_id,
    'cam-area-01',
    120,
    30,
    90,
    v_now
  );

  PERFORM run_fraud_rules(v_establishment_id);

  SELECT count(*) INTO v_count
  FROM alerts
  WHERE establishment_id = v_establishment_id
    AND type = 'crowd_no_sales'
    AND resolved = false;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'R01 falhou: esperado 1 alerta crowd_no_sales, obtido %', v_count;
  END IF;

  -- Reexecução não deve duplicar alerta ativo na janela de 2h
  PERFORM run_fraud_rules(v_establishment_id);

  SELECT count(*) INTO v_count
  FROM alerts
  WHERE establishment_id = v_establishment_id
    AND type = 'crowd_no_sales'
    AND resolved = false;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'R01 dedupe falhou: esperado 1 alerta crowd_no_sales, obtido %', v_count;
  END IF;

  -- ===========================================================
  -- R02: Gap financeiro acima do threshold
  -- ===========================================================
  INSERT INTO import_batches (
    id, establishment_id, source, filename, rows_total, rows_imported, rows_failed, status, imported_by
  )
  VALUES
    (v_batch_st,  v_establishment_id, 'st_ingressos', 'st_test.csv',  1, 1, 0, 'done', 'test'),
    (v_batch_pag, v_establishment_id, 'pagbank',      'pag_test.csv', 1, 1, 0, 'done', 'test');

  INSERT INTO transactions (
    establishment_id, batch_id, source, amount, payment_method, operator_id, occurred_at, imported_at
  )
  VALUES
    (v_establishment_id, v_batch_st,  'st_ingressos', 100.00, 'credit', 'op-1', v_now - interval '5 minutes', v_now),
    (v_establishment_id, v_batch_pag, 'pagbank',      450.00, 'credit', 'op-1', v_now - interval '5 minutes', v_now);

  PERFORM run_fraud_rules(v_establishment_id);

  SELECT count(*) INTO v_count
  FROM alerts
  WHERE establishment_id = v_establishment_id
    AND type = 'card_gap'
    AND resolved = false;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'R02 falhou: esperado 1 alerta card_gap, obtido %', v_count;
  END IF;

  -- ===========================================================
  -- R05: Cash ghost (espécie sem lançamento)
  -- ===========================================================
  INSERT INTO cash_payment_events (
    id, establishment_id, camera_id, detected_at, window_minutes, matched
  )
  VALUES (
    v_cash_event_unmatched,
    v_establishment_id,
    'cam-caixa',
    v_now - interval '2 minutes',
    15,
    false
  );

  PERFORM run_fraud_rules(v_establishment_id);

  SELECT count(*) INTO v_count
  FROM alerts
  WHERE establishment_id = v_establishment_id
    AND type = 'cash_ghost'
    AND resolved = false
    AND context ->> 'cash_event_id' = v_cash_event_unmatched::text;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'R05 falhou: esperado 1 alerta cash_ghost para evento %, obtido %', v_cash_event_unmatched, v_count;
  END IF;

  -- Cenário positivo: espécie com venda em dinheiro correspondente
  INSERT INTO cash_payment_events (
    id, establishment_id, camera_id, detected_at, window_minutes, matched
  )
  VALUES (
    v_cash_event_matched,
    v_establishment_id,
    'cam-caixa',
    v_now - interval '1 minute',
    15,
    false
  );

  INSERT INTO transactions (
    establishment_id, batch_id, source, amount, payment_method, operator_id, occurred_at, imported_at
  )
  VALUES (
    v_establishment_id,
    v_batch_st,
    'st_ingressos',
    75.00,
    'cash',
    'op-2',
    v_now - interval '1 minute',
    v_now
  );

  PERFORM run_fraud_rules(v_establishment_id);

  SELECT count(*) INTO v_count
  FROM cash_payment_events
  WHERE id = v_cash_event_matched
    AND matched = true;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'R05 match falhou: evento % deveria estar matched=true', v_cash_event_matched;
  END IF;
END $$;

SELECT 'ALL_RULE_TESTS_PASSED' AS status;

ROLLBACK;

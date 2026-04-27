-- =============================================================
-- SEED DE DEMONSTRAÇÃO — Sistema Antifraude
-- Simula uma noite completa (19h às 02h) com 3 anomalias reais
--
-- COMO USAR:
-- 1. Execute este script no SQL Editor do Supabase
-- 2. Recarregue o sistema no browser
-- 3. Siga o roteiro em ROTEIRO_DEMO.md
-- =============================================================

-- Limpa dados anteriores do estabelecimento demo
DELETE FROM alerts          WHERE establishment_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM transactions    WHERE establishment_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM people_count_events WHERE establishment_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM import_batches  WHERE establishment_id = 'aaaaaaaa-0000-0000-0000-000000000001';


-- ─────────────────────────────────────────────────────────────
-- LOTE DE IMPORTAÇÃO
-- ─────────────────────────────────────────────────────────────
INSERT INTO import_batches (id, establishment_id, source, filename, rows_total, rows_imported, rows_failed, status, imported_by)
VALUES
  ('bbbbbbbb-0001-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'st_ingressos', 'ST_INGRESSOS_270426.csv', 42, 42, 0, 'done', 'Admin'),
  ('bbbbbbbb-0002-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'pagbank',      'PAGBANK_EXTRATO_270426.csv', 35, 35, 0, 'done', 'Admin');


-- ─────────────────────────────────────────────────────────────
-- CÂMERAS — Fluxo de pessoas ao longo da noite
-- ─────────────────────────────────────────────────────────────
INSERT INTO people_count_events (establishment_id, camera_id, count_in, count_out, people_inside, recorded_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada', 12,  0,  12,  now() - interval '7 hours'),   -- 19h: abrindo
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada', 18,  4,  26,  now() - interval '6.5 hours'), -- 19h30
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada', 22,  6,  42,  now() - interval '6 hours'),   -- 20h
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada', 30,  8,  64,  now() - interval '5.5 hours'), -- 20h30: enchendo
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada', 25, 10,  79,  now() - interval '5 hours'),   -- 21h: pico
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada', 15, 12,  82,  now() - interval '4.5 hours'), -- 21h30: LOTADO
  -- ⚠️  ANOMALIA R01: 85 pessoas, zero vendas nos próximos 30min
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada', 10,  8,  85,  now() - interval '4 hours'),   -- 22h: PICO MÁXIMO
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada',  8, 15,  78,  now() - interval '3.5 hours'), -- 22h30
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada',  5, 20,  63,  now() - interval '3 hours'),   -- 23h: saindo
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada',  3, 25,  41,  now() - interval '2.5 hours'), -- 23h30
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada',  2, 30,  13,  now() - interval '2 hours'),   -- 00h: esvaziando
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cam-entrada',  0, 13,   0,  now() - interval '1.5 hours'); -- 00h30: vazio


-- ─────────────────────────────────────────────────────────────
-- TRANSAÇÕES ST INGRESSOS (Sistema de Consumo)
-- Total: R$ 6.847,50
-- ─────────────────────────────────────────────────────────────
INSERT INTO transactions (establishment_id, batch_id, source, amount, payment_method, operator_id, occurred_at, imported_at) VALUES
  -- 19h: abertura, movimento baixo
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  45.00, 'credit',  'op-marcos',  now() - interval '7 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  78.50, 'pix',     'op-julia',   now() - interval '6.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  32.00, 'debit',   'op-marcos',  now() - interval '6.6 hours', now()),
  -- 20h: movimento crescendo
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 120.00, 'credit',  'op-julia',   now() - interval '6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  95.00, 'pix',     'op-marcos',  now() - interval '5.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 215.00, 'credit',  'op-carla',   now() - interval '5.6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  88.00, 'debit',   'op-julia',   now() - interval '5.5 hours', now()),
  -- 21h: pico de movimento — tudo normal
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 340.00, 'credit',  'op-marcos',  now() - interval '5 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 175.50, 'pix',     'op-carla',   now() - interval '4.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 290.00, 'credit',  'op-julia',   now() - interval '4.7 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 155.00, 'debit',   'op-marcos',  now() - interval '4.6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 420.00, 'credit',  'op-carla',   now() - interval '4.5 hours', now()),
  -- ⚠️  22h: BAR LOTADO (85 pessoas) — ZERO VENDAS LANÇADAS (R01 vai disparar)
  -- [gap intencional de 30 minutos sem inserção aqui]
  -- 22h30: retomada das vendas mas valores baixos (suspeito)
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  55.00, 'cash',    'op-julia',   now() - interval '3.4 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  42.00, 'cash',    'op-julia',   now() - interval '3.3 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  38.00, 'cash',    'op-julia',   now() - interval '3.2 hours', now()),
  -- 23h em diante: encerrando
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 180.00, 'credit',  'op-marcos',  now() - interval '3 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  95.00, 'pix',     'op-carla',   now() - interval '2.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 210.00, 'credit',  'op-marcos',  now() - interval '2.6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  75.00, 'debit',   'op-carla',   now() - interval '2.4 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 130.00, 'credit',  'op-julia',   now() - interval '2.2 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  62.50, 'pix',     'op-marcos',  now() - interval '2 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 850.00, 'credit',  'op-carla',   now() - interval '1.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 315.00, 'pix',     'op-julia',   now() - interval '1.6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 192.00, 'credit',  'op-marcos',  now() - interval '1.4 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  88.00, 'debit',   'op-carla',   now() - interval '1.2 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos', 145.00, 'pix',     'op-julia',   now() - interval '1 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  67.00, 'cash',    'op-marcos',  now() - interval '0.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', 'st_ingressos',  44.00, 'pix',     'op-carla',   now() - interval '0.5 hours', now());

-- ─────────────────────────────────────────────────────────────
-- TRANSAÇÕES PAGBANK
-- ⚠️  ANOMALIA R02: Total PagBank propositalmente MENOR
-- ST Ingressos = R$ 4.672,50  |  PagBank = R$ 3.521,00
-- Gap = R$ 1.151,50 (operador Julia com muitas vendas em cash não registradas)
-- ─────────────────────────────────────────────────────────────
INSERT INTO transactions (establishment_id, batch_id, source, amount, payment_method, operator_id, occurred_at, imported_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank',  45.00, 'credit', 'op-marcos', now() - interval '7 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank',  78.50, 'pix',    'op-julia',  now() - interval '6.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 120.00, 'credit', 'op-julia',  now() - interval '6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank',  95.00, 'pix',    'op-marcos', now() - interval '5.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 215.00, 'credit', 'op-carla',  now() - interval '5.6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 340.00, 'credit', 'op-marcos', now() - interval '5 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 175.50, 'pix',    'op-carla',  now() - interval '4.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 290.00, 'credit', 'op-julia',  now() - interval '4.7 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 420.00, 'credit', 'op-carla',  now() - interval '4.5 hours', now()),
  -- gap: sem pagbank das 22h às 22h30 (período do R01)
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 180.00, 'credit', 'op-marcos', now() - interval '3 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank',  95.00, 'pix',    'op-carla',  now() - interval '2.8 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 210.00, 'credit', 'op-marcos', now() - interval '2.6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 130.00, 'credit', 'op-julia',  now() - interval '2.2 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 315.00, 'pix',    'op-julia',  now() - interval '1.6 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 192.00, 'credit', 'op-marcos', now() - interval '1.4 hours', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0002-0000-0000-000000000001', 'pagbank', 145.00, 'pix',    'op-julia',  now() - interval '1 hours', now());


-- ─────────────────────────────────────────────────────────────
-- DISPARA O MOTOR DE REGRAS
-- ─────────────────────────────────────────────────────────────
SELECT * FROM run_fraud_rules('aaaaaaaa-0000-0000-0000-000000000001');

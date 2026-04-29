-- =============================================================
-- SISTEMA ANTIFRAUDE — Schema Inicial
-- RonalDigital
-- Executar no SQL Editor do Supabase (dashboard)
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. EXTENSÕES
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";      -- Para jobs agendados (motor de regras)


-- ─────────────────────────────────────────────────────────────
-- 2. TABELA: establishments
--    Suporte a múltiplos estabelecimentos desde o início
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS establishments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,             -- ex: "bar-do-ze", usado em URLs
  address     text,
  phone       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE establishments IS 'Estabelecimentos clientes do sistema antifraude.';


-- ─────────────────────────────────────────────────────────────
-- 3. TABELA: settings
--    Configurações por estabelecimento (thresholds, WhatsApp)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id        uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  whatsapp_number         text,                   -- ex: "5585991993833"
  telegram_chat_id        text,                   -- chat_id do destinatário
  r01_min_people          integer NOT NULL DEFAULT 30,
  r01_window_minutes      integer NOT NULL DEFAULT 30,
  r02_gap_threshold       numeric(10,2) NOT NULL DEFAULT 200.00,
  strict_audit_mode       boolean NOT NULL DEFAULT false,
  monitoring_start_time   time DEFAULT '18:00:00',
  monitoring_end_time     time DEFAULT '04:00:00',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id)
);

COMMENT ON TABLE settings IS 'Thresholds e configurações de notificação por estabelecimento.';


-- ─────────────────────────────────────────────────────────────
-- 4. TABELA: import_batches
--    Rastreia cada importação de CSV
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id  uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  source            text NOT NULL CHECK (source IN ('st_ingressos', 'pagbank', 'manual')),
  filename          text NOT NULL,
  rows_total        integer NOT NULL DEFAULT 0,
  rows_imported     integer NOT NULL DEFAULT 0,
  rows_failed       integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'failed')),
  imported_by       text NOT NULL,               -- nome do operador ou "system"
  error_log         jsonb,                        -- detalhes de linhas com erro
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE import_batches IS 'Histórico de importações de arquivos CSV (PagBank, ST Ingressos).';

CREATE INDEX IF NOT EXISTS idx_import_batches_establishment ON import_batches(establishment_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 5. TABELA: transactions
--    Toda movimentação financeira registrada
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id  uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  batch_id          uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  source            text NOT NULL CHECK (source IN ('st_ingressos', 'pagbank', 'manual')),
  amount            numeric(10,2) NOT NULL CHECK (amount >= 0),
  payment_method    text NOT NULL CHECK (payment_method IN ('cash', 'credit', 'debit', 'pix')),
  operator_id       text,                         -- ID do garçom/operador
  occurred_at       timestamptz NOT NULL,
  imported_at       timestamptz NOT NULL DEFAULT now(),
  raw_data          jsonb                          -- linha original do CSV para auditoria
);

COMMENT ON TABLE transactions IS 'Transações financeiras importadas de PagBank, ST Ingressos ou inseridas manualmente.';

CREATE INDEX IF NOT EXISTS idx_transactions_establishment ON transactions(establishment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at ON transactions(establishment_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(establishment_id, source);
CREATE INDEX IF NOT EXISTS idx_transactions_operator ON transactions(operator_id) WHERE operator_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 6. TABELA: people_count_events
--    Dados de contagem de pessoas das câmeras
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_count_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id  uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  camera_id         text NOT NULL,
  count_in          integer NOT NULL DEFAULT 0 CHECK (count_in >= 0),
  count_out         integer NOT NULL DEFAULT 0 CHECK (count_out >= 0),
  people_inside     integer NOT NULL DEFAULT 0 CHECK (people_inside >= 0),
  recorded_at       timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE people_count_events IS 'Eventos de contagem de pessoas por câmera (entrada, saída, total no local).';

CREATE INDEX IF NOT EXISTS idx_people_count_establishment ON people_count_events(establishment_id);
CREATE INDEX IF NOT EXISTS idx_people_count_recorded_at ON people_count_events(establishment_id, recorded_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 7. TABELA: alerts
--    Alertas gerados pelo motor de regras
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id  uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  type              text NOT NULL CHECK (type IN (
                      'crowd_no_sales',          -- R01: Salão cheio, caixa vazio
                      'card_gap',                -- R02: Divergência PagBank x ST Ingressos
                      'dead_window',             -- R04: Janela morta no pico
                      'velocity_spike',          -- R03: Pico anormal de vendas
                      'shift_missing_closing',   -- Turno sem fechamento de caixa
                      'operator_void_abuse',     -- Operador com excesso de cancelamentos
                      'weight_label_mismatch'    -- Balança x câmera (futuro)
                    )),
  severity          text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description       text NOT NULL,
  context           jsonb NOT NULL DEFAULT '{}', -- dados do evento que gerou o alerta
  resolved          boolean NOT NULL DEFAULT false,
  resolved_by       text,                        -- nome/ID de quem resolveu
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE alerts IS 'Alertas de anomalia gerados pelo motor de regras antifraude.';

CREATE INDEX IF NOT EXISTS idx_alerts_establishment ON alerts(establishment_id);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON alerts(establishment_id, created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(establishment_id, type);


-- ─────────────────────────────────────────────────────────────
-- 8. ROW LEVEL SECURITY
--    Habilitado em todas as tabelas.
--    MVP: backend usa service_role (bypassa RLS).
--    Produção: adicionar políticas por auth.uid() quando
--    o sistema de autenticação for implementado.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE establishments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_count_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts               ENABLE ROW LEVEL SECURITY;

-- Políticas temporárias para MVP (backend com service_role bypassa automaticamente)
-- ATENÇÃO: remover estas políticas quando autenticação for implementada

CREATE POLICY "service_role_all_establishments"      ON establishments      USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_settings"            ON settings            USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_import_batches"      ON import_batches      USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_transactions"        ON transactions        USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_people_count_events" ON people_count_events USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_alerts"              ON alerts              USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────
-- 9. FUNÇÃO: updated_at automático
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_establishments_updated_at
  BEFORE UPDATE ON establishments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 10. FUNÇÃO: resolve_alert
--     Resolve um alerta e registra quem resolveu e quando
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION resolve_alert(
  p_alert_id  uuid,
  p_resolved_by text
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE alerts
  SET
    resolved    = true,
    resolved_by = p_resolved_by,
    resolved_at = now()
  WHERE id = p_alert_id
    AND resolved = false;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 11. FUNÇÃO: run_fraud_rules
--     Motor de regras central — chamado após cada ingestão
--     Retorna os alertas criados nesta execução
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_fraud_rules(p_establishment_id uuid)
RETURNS TABLE(alert_type text, severity text, description text) LANGUAGE plpgsql AS $$
DECLARE
  v_settings    settings%ROWTYPE;
  v_last_people people_count_events%ROWTYPE;
  v_recent_sales_count integer;
  v_pagbank_total numeric;
  v_st_total      numeric;
  v_gap           numeric;
  v_window_start  timestamptz;
BEGIN
  -- Carrega configurações do estabelecimento
  SELECT * INTO v_settings
  FROM settings
  WHERE establishment_id = p_establishment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configurações não encontradas para establishment %', p_establishment_id;
  END IF;

  -- ── R01: Lotação sem Vendas ──────────────────────────────
  SELECT * INTO v_last_people
  FROM people_count_events
  WHERE establishment_id = p_establishment_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  IF FOUND AND v_last_people.people_inside > v_settings.r01_min_people THEN
    v_window_start := now() - (v_settings.r01_window_minutes || ' minutes')::interval;

    SELECT COUNT(*) INTO v_recent_sales_count
    FROM transactions
    WHERE establishment_id = p_establishment_id
      AND source = 'st_ingressos'
      AND occurred_at >= v_window_start;

    IF v_recent_sales_count = 0 THEN
      -- Evita duplicata de alerta ativo do mesmo tipo
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
                 v_last_people.people_inside, v_settings.r01_window_minutes),
          jsonb_build_object(
            'people_inside', v_last_people.people_inside,
            'window_minutes', v_settings.r01_window_minutes,
            'camera_id', v_last_people.camera_id
          )
        );
        RETURN QUERY SELECT 'crowd_no_sales', 'high',
          format('R01: %s pessoas sem vendas.', v_last_people.people_inside);
      END IF;
    END IF;
  END IF;

  -- ── R02: Gap Financeiro ──────────────────────────────────
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
          'st_total', v_st_total,
          'diff', v_pagbank_total - v_st_total,
          'threshold', v_settings.r02_gap_threshold
        )
      );
      RETURN QUERY SELECT 'card_gap', 'high',
        format('R02: Gap de R$ %s.', v_gap);
    END IF;
  END IF;

END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 12. DADOS INICIAIS: estabelecimento de demonstração
-- ─────────────────────────────────────────────────────────────
INSERT INTO establishments (id, name, slug, address, phone)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Bar Central (Demo)',
  'bar-central-demo',
  'Rua Exemplo, 123 — Fortaleza/CE',
  '5585991993833'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO settings (establishment_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (establishment_id) DO NOTHING;

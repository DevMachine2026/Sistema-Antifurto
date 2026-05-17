-- =============================================================
-- MIGRATION: Security hotfix (RLS + funções)
-- Olho Vivo — aplicar UMA vez no SQL Editor (PRODUCTION)
--
-- Corrige:
--   V1  cameras RLS aberta (cameras_all)
--   V2  agent_* policies service_role com USING(true) para todos os roles
--   V3  get_pos_timeline SECURITY DEFINER sem checagem de tenant
--   V4  escalação de role em profiles
--   V5  platform_admin ALL em agent_configs (credenciais RTSP)
--   E   run_fraud_rules sem R05 (regressão people_count_fix)
--
-- Pré-requisito: migration_rbac_multitenant.sql + migration_platform_admin_scope.sql
-- Pós-execução: rode os SELECTs de validação no final deste arquivo.
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- A) RLS — tabela cameras
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cameras_all" ON public.cameras;

DROP POLICY IF EXISTS "rbac_cameras_tenant" ON public.cameras;
CREATE POLICY "rbac_cameras_tenant"
  ON public.cameras
  FOR ALL
  TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

-- ─────────────────────────────────────────────────────────────
-- B) RLS — agent_* (remove bypass OR true + platform_admin em dados sensíveis)
--     service_role nas Edge Functions continua com bypass nativo do Supabase.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_agent_configs" ON public.agent_configs;
DROP POLICY IF EXISTS "service_role_agent_heartbeats" ON public.agent_heartbeats;
DROP POLICY IF EXISTS "service_role_agent_camera_candidates" ON public.agent_camera_candidates;

DROP POLICY IF EXISTS "platform_admin_agent_configs" ON public.agent_configs;
DROP POLICY IF EXISTS "platform_admin_agent_heartbeats" ON public.agent_heartbeats;
DROP POLICY IF EXISTS "platform_admin_agent_camera_candidates" ON public.agent_camera_candidates;

-- ─────────────────────────────────────────────────────────────
-- C) profiles — impede merchant de promover role para platform_admin
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.current_user_is_platform_admin() THEN
    RAISE EXCEPTION 'role_change_forbidden'
      USING ERRCODE = '42501',
            HINT = 'Apenas platform_admin pode alterar o campo role.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_role_guard ON public.profiles;
CREATE TRIGGER trg_profiles_role_guard
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ─────────────────────────────────────────────────────────────
-- D) get_pos_timeline — SECURITY DEFINER com isolamento de tenant
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pos_timeline(
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_establishment_access(p_establishment_id) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501',
            HINT = 'Sem acesso a este estabelecimento.';
  END IF;

  RETURN QUERY
  SELECT * FROM (
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
        WHEN cpe.id IS NOT NULL        THEN 'matched'
        WHEN t.payment_method = 'cash' THEN 'no_cash_evidence'
        ELSE                                'card_ok'
      END                                                                     AS sync_status
    FROM public.transactions t
    LEFT JOIN LATERAL (
      SELECT c.*
      FROM public.cash_payment_events c
      WHERE c.establishment_id = t.establishment_id
        AND c.detected_at BETWEEN t.occurred_at::timestamptz - interval '10 minutes'
                              AND t.occurred_at::timestamptz + interval '10 minutes'
      ORDER BY ABS(EXTRACT(EPOCH FROM (t.occurred_at::timestamptz - c.detected_at)))
      LIMIT 1
    ) cpe ON true
    WHERE t.establishment_id = p_establishment_id
      AND t.occurred_at::timestamptz BETWEEN p_from AND p_to

    UNION ALL

    SELECT
      'orphan_cash'::text,
      NULL::uuid,
      NULL::timestamptz,
      NULL::numeric,
      NULL::text,
      NULL::text,
      NULL::text,
      c.id,
      c.detected_at,
      c.camera_id,
      c.evidence_url,
      NULL::float8,
      'orphan_cash'::text
    FROM public.cash_payment_events c
    WHERE c.establishment_id = p_establishment_id
      AND c.detected_at BETWEEN p_from AND p_to
      AND NOT EXISTS (
        SELECT 1
        FROM public.transactions t
        WHERE t.establishment_id = p_establishment_id
          AND t.occurred_at::timestamptz
                BETWEEN c.detected_at - interval '10 minutes'
                    AND c.detected_at + interval '10 minutes'
      )
  ) timeline
  ORDER BY COALESCE(timeline.occurred_at, timeline.cash_detected_at) DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- E) run_fraud_rules — R01 (multi-câmera + janela) + R02 + R05 unificados
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_fraud_rules(p_establishment_id uuid)
RETURNS TABLE(alert_type text, severity text, description text)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_settings              public.settings%ROWTYPE;
  v_total_people_inside   integer  := 0;
  v_recent_event_at       timestamptz;
  v_recent_sales_count    integer;
  v_pagbank_total         numeric;
  v_st_total              numeric;
  v_gap                   numeric;
  v_window_start          timestamptz;
  v_cash                  public.cash_payment_events%ROWTYPE;
  v_has_cash_sale         boolean;
BEGIN
  SELECT * INTO v_settings
  FROM public.settings
  WHERE establishment_id = p_establishment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configurações não encontradas para establishment %', p_establishment_id;
  END IF;

  v_window_start := now() - (v_settings.r01_window_minutes || ' minutes')::interval;

  -- R01: último evento por câmera na janela, soma people_inside
  SELECT
    COALESCE(SUM(latest.people_inside), 0),
    MAX(latest.recorded_at)
  INTO v_total_people_inside, v_recent_event_at
  FROM (
    SELECT DISTINCT ON (camera_id)
      camera_id, people_inside, recorded_at
    FROM public.people_count_events
    WHERE establishment_id = p_establishment_id
      AND recorded_at >= v_window_start
    ORDER BY camera_id, recorded_at DESC
  ) latest;

  IF v_recent_event_at IS NOT NULL AND v_total_people_inside > v_settings.r01_min_people THEN
    SELECT COUNT(*) INTO v_recent_sales_count
    FROM public.transactions
    WHERE establishment_id = p_establishment_id
      AND source = 'st_ingressos'
      AND occurred_at >= v_window_start;

    IF v_recent_sales_count = 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.alerts
        WHERE establishment_id = p_establishment_id
          AND type = 'crowd_no_sales'
          AND resolved = false
          AND created_at >= now() - interval '2 hours'
      ) THEN
        INSERT INTO public.alerts (establishment_id, type, severity, description, context)
        VALUES (
          p_establishment_id,
          'crowd_no_sales',
          'high',
          format('R01: %s pessoas no salão sem vendas nos últimos %s min.',
                 v_total_people_inside, v_settings.r01_window_minutes),
          jsonb_build_object(
            'people_inside',  v_total_people_inside,
            'window_minutes', v_settings.r01_window_minutes,
            'window_start',   v_window_start
          )
        );
        RETURN QUERY SELECT
          'crowd_no_sales'::text,
          'high'::text,
          format('R01: %s pessoas sem vendas.', v_total_people_inside);
      END IF;
    END IF;
  END IF;

  -- R02: gap PagBank x ST (totais acumulados — comportamento legado)
  SELECT COALESCE(SUM(amount), 0) INTO v_pagbank_total
  FROM public.transactions
  WHERE establishment_id = p_establishment_id AND source = 'pagbank';

  SELECT COALESCE(SUM(amount), 0) INTO v_st_total
  FROM public.transactions
  WHERE establishment_id = p_establishment_id AND source = 'st_ingressos';

  v_gap := ABS(v_pagbank_total - v_st_total);

  IF v_gap > v_settings.r02_gap_threshold THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.alerts
      WHERE establishment_id = p_establishment_id
        AND type = 'card_gap'
        AND resolved = false
        AND created_at >= now() - interval '2 hours'
    ) THEN
      INSERT INTO public.alerts (establishment_id, type, severity, description, context)
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

  -- R05: cash ghost
  FOR v_cash IN
    SELECT *
    FROM public.cash_payment_events
    WHERE establishment_id = p_establishment_id
      AND matched = false
      AND detected_at >= now() - interval '4 hours'
    ORDER BY detected_at ASC
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE establishment_id = p_establishment_id
        AND source = 'st_ingressos'
        AND payment_method = 'cash'
        AND occurred_at BETWEEN
              v_cash.detected_at - (v_cash.window_minutes || ' minutes')::interval
          AND v_cash.detected_at + (v_cash.window_minutes || ' minutes')::interval
    ) INTO v_has_cash_sale;

    IF v_has_cash_sale THEN
      UPDATE public.cash_payment_events SET matched = true WHERE id = v_cash.id;
    ELSE
      UPDATE public.cash_payment_events SET matched = false WHERE id = v_cash.id;

      IF NOT EXISTS (
        SELECT 1 FROM public.alerts
        WHERE establishment_id = p_establishment_id
          AND type = 'cash_ghost'
          AND resolved = false
          AND context->>'cash_event_id' = v_cash.id::text
      ) THEN
        INSERT INTO public.alerts (establishment_id, type, severity, description, context)
        VALUES (
          p_establishment_id,
          'cash_ghost',
          'high',
          format(
            'R05: Pagamento em espécie detectado às %s sem lançamento no ST Ingressos.',
            to_char(v_cash.detected_at AT TIME ZONE 'America/Fortaleza', 'HH24:MI')
          ),
          jsonb_build_object(
            'cash_event_id',  v_cash.id,
            'detected_at',    v_cash.detected_at,
            'camera_id',      v_cash.camera_id,
            'window_minutes', v_cash.window_minutes
          )
        );
        RETURN QUERY SELECT
          'cash_ghost'::text,
          'high'::text,
          format(
            'R05: Espécie sem lançamento detectada às %s.',
            to_char(v_cash.detected_at AT TIME ZONE 'America/Fortaleza', 'HH24:MI')
          );
      END IF;
    END IF;
  END LOOP;

END;
$$;

-- ─────────────────────────────────────────────────────────────
-- F) Índices de performance (R01 + match de caixa)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_people_count_est_cam_time
  ON public.people_count_events (establishment_id, camera_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_est_cash_window
  ON public.transactions (establishment_id, occurred_at DESC)
  WHERE payment_method = 'cash' AND source = 'st_ingressos';

COMMIT;

-- =============================================================
-- VALIDAÇÃO (rodar após COMMIT — devem retornar 0 linhas / has_r05 true)
-- =============================================================

-- 1) Policies perigosas em cameras/agent (esperado: 0 linhas)
-- SELECT tablename, policyname, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('cameras', 'agent_configs', 'agent_heartbeats', 'agent_camera_candidates')
--   AND (qual = 'true' OR qual IS NULL);

-- 2) run_fraud_rules contém R05 (esperado: has_r05 = true)
-- SELECT prosrc LIKE '%cash_ghost%' AS has_r05
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'run_fraud_rules';

-- 3) Policy cameras tenant (esperado: rbac_cameras_tenant)
-- SELECT policyname FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'cameras';

-- 4) Trigger de role em profiles
-- SELECT tgname FROM pg_trigger t
-- JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE c.relname = 'profiles' AND tgname = 'trg_profiles_role_guard';

-- =============================================================
-- MIGRATION: Retenção de dados (DB) + suporte a purge de evidências
-- Aplicar após migration_evidence_private.sql
--
-- PASSO MANUAL (Integrations → Cron → SQL Snippet + pg_net):
--   Agendar POST diário em evidence-purge (ex.: 04:00 UTC)
--   Header: x-cron-secret = valor de CRON_SECRET nos Secrets
--   Deploy: supabase functions deploy evidence-purge --no-verify-jwt
--
-- Variáveis (opcional, defaults abaixo):
--   people_count_events: 90 dias
--   cash_payment_events: 90 dias
--   audit_events: 180 dias
-- =============================================================

BEGIN;

-- Remove eventos de contagem antigos (evidência no Storage é limpa pela Edge evidence-purge)
CREATE OR REPLACE FUNCTION public.purge_old_people_count_events(p_days int DEFAULT 90)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF p_days IS NULL OR p_days < 7 THEN
    RAISE EXCEPTION 'p_days must be >= 7';
  END IF;

  DELETE FROM public.people_count_events
  WHERE recorded_at < now() - make_interval(days => p_days);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_old_cash_payment_events(p_days int DEFAULT 90)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF p_days IS NULL OR p_days < 7 THEN
    RAISE EXCEPTION 'p_days must be >= 7';
  END IF;

  DELETE FROM public.cash_payment_events
  WHERE detected_at < now() - make_interval(days => p_days);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_old_audit_events(p_days int DEFAULT 180)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF p_days IS NULL OR p_days < 30 THEN
    RAISE EXCEPTION 'p_days must be >= 30';
  END IF;

  DELETE FROM public.audit_events
  WHERE created_at < now() - make_interval(days => p_days);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Job diário 04:00 UTC (ajuste no Dashboard se necessário)
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('olhovivo_purge_old_events');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
    'olhovivo_purge_old_events',
    '0 4 * * *',
    $job$
      SELECT public.purge_old_people_count_events(90);
      SELECT public.purge_old_cash_payment_events(90);
      SELECT public.purge_old_audit_events(180);
    $job$
    );
  END IF;
END;
$cron$;

REVOKE ALL ON FUNCTION public.purge_old_people_count_events(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_old_cash_payment_events(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_old_audit_events(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_people_count_events(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_cash_payment_events(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_events(int) TO service_role;

COMMIT;

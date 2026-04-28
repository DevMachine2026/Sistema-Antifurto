-- =============================================================
-- MIGRATION: RLS de produção com isolamento por estabelecimento
-- =============================================================
-- Estratégia:
-- 1) Remove políticas permissivas de MVP.
-- 2) Usa claim JWT `establishment_id` para escopo de leitura/escrita.
-- 3) Mantém service_role funcionando (bypass nativo do Supabase).

BEGIN;

-- Helper para ler establishment_id do JWT de forma segura
CREATE OR REPLACE FUNCTION public.current_establishment_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(auth.jwt() ->> 'establishment_id', '')::uuid;
$$;

COMMENT ON FUNCTION public.current_establishment_id IS
  'Retorna o establishment_id do JWT (claim establishment_id).';

-- Garante RLS habilitado em todas as tabelas de domínio
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_count_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payment_events ENABLE ROW LEVEL SECURITY;

-- Remove políticas permissivas legadas (MVP)
DROP POLICY IF EXISTS "service_role_all_establishments" ON public.establishments;
DROP POLICY IF EXISTS "service_role_all_settings" ON public.settings;
DROP POLICY IF EXISTS "service_role_all_import_batches" ON public.import_batches;
DROP POLICY IF EXISTS "service_role_all_transactions" ON public.transactions;
DROP POLICY IF EXISTS "service_role_all_people_count_events" ON public.people_count_events;
DROP POLICY IF EXISTS "service_role_all_alerts" ON public.alerts;
DROP POLICY IF EXISTS "service_role_all_cash_payment_events" ON public.cash_payment_events;

-- Políticas por tenant (JWT claim)
CREATE POLICY "tenant_establishments_select"
  ON public.establishments
  FOR SELECT
  TO authenticated
  USING (id = public.current_establishment_id());

CREATE POLICY "tenant_settings_select"
  ON public.settings
  FOR SELECT
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_settings_update"
  ON public.settings
  FOR UPDATE
  TO authenticated
  USING (establishment_id = public.current_establishment_id())
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_settings_insert"
  ON public.settings
  FOR INSERT
  TO authenticated
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_import_batches_select"
  ON public.import_batches
  FOR SELECT
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_import_batches_insert"
  ON public.import_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_import_batches_update"
  ON public.import_batches
  FOR UPDATE
  TO authenticated
  USING (establishment_id = public.current_establishment_id())
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_transactions_select"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_transactions_insert"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_transactions_update"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (establishment_id = public.current_establishment_id())
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_transactions_delete"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_people_count_events_select"
  ON public.people_count_events
  FOR SELECT
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_people_count_events_insert"
  ON public.people_count_events
  FOR INSERT
  TO authenticated
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_people_count_events_update"
  ON public.people_count_events
  FOR UPDATE
  TO authenticated
  USING (establishment_id = public.current_establishment_id())
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_people_count_events_delete"
  ON public.people_count_events
  FOR DELETE
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_alerts_select"
  ON public.alerts
  FOR SELECT
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_alerts_insert"
  ON public.alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_alerts_update"
  ON public.alerts
  FOR UPDATE
  TO authenticated
  USING (establishment_id = public.current_establishment_id())
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_alerts_delete"
  ON public.alerts
  FOR DELETE
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_cash_payment_events_select"
  ON public.cash_payment_events
  FOR SELECT
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_cash_payment_events_insert"
  ON public.cash_payment_events
  FOR INSERT
  TO authenticated
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_cash_payment_events_update"
  ON public.cash_payment_events
  FOR UPDATE
  TO authenticated
  USING (establishment_id = public.current_establishment_id())
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_cash_payment_events_delete"
  ON public.cash_payment_events
  FOR DELETE
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

COMMIT;

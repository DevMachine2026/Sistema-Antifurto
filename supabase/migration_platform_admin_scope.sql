-- Restringe platform_admin: gestão de clientes, sem dados operacionais dos comerciantes.
-- Aplicar após migration_rbac_multitenant.sql

BEGIN;

DROP POLICY IF EXISTS "rbac_settings_all" ON public.settings;
DROP POLICY IF EXISTS "rbac_import_batches_all" ON public.import_batches;
DROP POLICY IF EXISTS "rbac_transactions_all" ON public.transactions;
DROP POLICY IF EXISTS "rbac_people_count_events_all" ON public.people_count_events;
DROP POLICY IF EXISTS "rbac_alerts_all" ON public.alerts;
DROP POLICY IF EXISTS "rbac_cash_payment_events_all" ON public.cash_payment_events;
DROP POLICY IF EXISTS "rbac_audit_events_all" ON public.audit_events;

CREATE POLICY "rbac_settings_tenant"
  ON public.settings FOR ALL TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_import_batches_tenant"
  ON public.import_batches FOR ALL TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_transactions_tenant"
  ON public.transactions FOR ALL TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_people_count_events_tenant"
  ON public.people_count_events FOR ALL TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_alerts_tenant"
  ON public.alerts FOR ALL TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_cash_payment_events_tenant"
  ON public.cash_payment_events FOR ALL TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_audit_events_tenant"
  ON public.audit_events FOR ALL TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

-- platform_admin: metadados de estabelecimentos (ativar/desativar), sem transações/eventos
DROP POLICY IF EXISTS "rbac_establishments_select" ON public.establishments;
CREATE POLICY "rbac_establishments_select"
  ON public.establishments FOR SELECT TO authenticated
  USING (
    public.current_user_is_platform_admin()
    OR public.user_has_establishment_access(id)
  );

CREATE POLICY "rbac_establishments_update_platform"
  ON public.establishments FOR UPDATE TO authenticated
  USING (public.current_user_is_platform_admin())
  WITH CHECK (public.current_user_is_platform_admin());

COMMIT;

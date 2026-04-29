-- =============================================================
-- MIGRATION: Hardening RLS para audit_events
-- Remove policy legada permissiva e padroniza isolamento por tenant
-- =============================================================

BEGIN;

-- Garante a função helper usada pelas policies de tenant
CREATE OR REPLACE FUNCTION public.current_establishment_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(auth.jwt() ->> 'establishment_id', '')::uuid;
$$;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_audit_events" ON public.audit_events;
DROP POLICY IF EXISTS "tenant_audit_events_select" ON public.audit_events;
DROP POLICY IF EXISTS "tenant_audit_events_insert" ON public.audit_events;
DROP POLICY IF EXISTS "tenant_audit_events_update" ON public.audit_events;
DROP POLICY IF EXISTS "tenant_audit_events_delete" ON public.audit_events;

CREATE POLICY "tenant_audit_events_select"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_audit_events_insert"
  ON public.audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_audit_events_update"
  ON public.audit_events
  FOR UPDATE
  TO authenticated
  USING (establishment_id = public.current_establishment_id())
  WITH CHECK (establishment_id = public.current_establishment_id());

CREATE POLICY "tenant_audit_events_delete"
  ON public.audit_events
  FOR DELETE
  TO authenticated
  USING (establishment_id = public.current_establishment_id());

COMMIT;

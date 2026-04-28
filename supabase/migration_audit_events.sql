-- =============================================================
-- MIGRATION: Trilha de auditoria operacional
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor text NOT NULL DEFAULT 'system',
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_establishment_created_at
  ON public.audit_events(establishment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_type
  ON public.audit_events(establishment_id, event_type, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Compatibilidade com ambiente MVP/service_role
DROP POLICY IF EXISTS "service_role_all_audit_events" ON public.audit_events;
CREATE POLICY "service_role_all_audit_events"
  ON public.audit_events
  USING (true)
  WITH CHECK (true);

-- Isolamento por tenant para usuários autenticados
DROP POLICY IF EXISTS "tenant_audit_events_select" ON public.audit_events;
CREATE POLICY "tenant_audit_events_select"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (establishment_id = nullif(auth.jwt() ->> 'establishment_id', '')::uuid);

DROP POLICY IF EXISTS "tenant_audit_events_insert" ON public.audit_events;
CREATE POLICY "tenant_audit_events_insert"
  ON public.audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (establishment_id = nullif(auth.jwt() ->> 'establishment_id', '')::uuid);

COMMIT;

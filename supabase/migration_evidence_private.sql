-- =============================================================
-- MIGRATION: Evidências privadas (Storage RLS + storage_path)
-- Aplicar após migration_evidence.sql e migration_security_hotfix.sql
--
-- PASSO MANUAL (Dashboard → Storage → bucket "evidence"):
--   1. Edit bucket → desmarque "Public bucket"
--   2. Salvar
-- =============================================================

BEGIN;

ALTER TABLE public.people_count_events
  ADD COLUMN IF NOT EXISTS evidence_storage_path text;

ALTER TABLE public.cash_payment_events
  ADD COLUMN IF NOT EXISTS evidence_storage_path text;

COMMENT ON COLUMN public.people_count_events.evidence_storage_path IS
  'Path no bucket evidence (ex.: {establishment_id}/{camera_id}/{ts}.jpg).';
COMMENT ON COLUMN public.cash_payment_events.evidence_storage_path IS
  'Path no bucket evidence (ex.: {establishment_id}/cash_{event_key}.jpg).';

-- Backfill a partir de URLs públicas legadas
UPDATE public.people_count_events
SET evidence_storage_path = substring(evidence_url from 'evidence/(.+)$')
WHERE evidence_storage_path IS NULL
  AND evidence_url IS NOT NULL
  AND evidence_url LIKE '%/evidence/%';

UPDATE public.cash_payment_events
SET evidence_storage_path = substring(evidence_url from 'evidence/(.+)$')
WHERE evidence_storage_path IS NULL
  AND evidence_url IS NOT NULL
  AND evidence_url LIKE '%/evidence/%';

-- RLS no Storage: merchant só lê pasta do próprio establishment_id
DROP POLICY IF EXISTS "tenant_evidence_select" ON storage.objects;
CREATE POLICY "tenant_evidence_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.user_has_establishment_access(((storage.foldername(name))[1])::uuid)
  );

-- Upload/delete apenas via service_role (Edge Functions / agente)
DROP POLICY IF EXISTS "service_role_evidence_all" ON storage.objects;
CREATE POLICY "service_role_evidence_all"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'evidence')
  WITH CHECK (bucket_id = 'evidence');

COMMIT;

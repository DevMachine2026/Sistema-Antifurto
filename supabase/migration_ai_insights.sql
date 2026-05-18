-- =============================================================
-- MIGRATION: Análises IA (Gemini) — cache por estabelecimento
-- Aplicar após migration_export_tenant.sql
-- Secret: GEMINI_API_KEY (Edge Functions → Secrets)
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  analysis_type text NOT NULL CHECK (analysis_type IN (
    'dashboard', 'shift_summary', 'alert_investigation', 'business_insights', 'executive'
  )),
  period_key text NOT NULL,
  context_hash text NOT NULL DEFAULT '',
  risk_score smallint NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  cached boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  UNIQUE (establishment_id, analysis_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_establishment_created
  ON public.ai_analyses(establishment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_expires
  ON public.ai_analyses(expires_at);

ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rbac_ai_analyses_all" ON public.ai_analyses;
CREATE POLICY "rbac_ai_analyses_all"
  ON public.ai_analyses
  FOR ALL
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

COMMENT ON TABLE public.ai_analyses IS 'Cache de análises do analista IA (Gemini via Edge Function)';

COMMIT;

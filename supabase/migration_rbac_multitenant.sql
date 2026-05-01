-- =============================================================
-- MIGRATION: RBAC multi-tenant (platform_admin + merchant_admin)
-- =============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('platform_admin', 'merchant_admin');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role public.app_role NOT NULL DEFAULT 'merchant_admin',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, establishment_id)
);

CREATE INDEX IF NOT EXISTS idx_user_establishments_user
  ON public.user_establishments(user_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_user_establishments_establishment
  ON public.user_establishments(establishment_id)
  WHERE active = true;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_establishments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.active = true
      AND p.role = 'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_establishment_access(p_establishment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_establishments ue
    WHERE ue.user_id = auth.uid()
      AND ue.establishment_id = p_establishment_id
      AND ue.active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_establishment_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT ue.establishment_id
  FROM public.user_establishments ue
  WHERE ue.user_id = auth.uid()
    AND ue.active = true
  ORDER BY ue.created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_new_user_profile ON auth.users;
CREATE TRIGGER trg_handle_new_user_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

INSERT INTO public.profiles (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

DROP POLICY IF EXISTS "profiles_select_self_or_platform_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_platform_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_platform_admin());

DROP POLICY IF EXISTS "profiles_update_self_or_platform_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_platform_admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR public.current_user_is_platform_admin());

DROP POLICY IF EXISTS "user_establishments_select_scope" ON public.user_establishments;
CREATE POLICY "user_establishments_select_scope"
  ON public.user_establishments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_platform_admin());

DROP POLICY IF EXISTS "user_establishments_insert_platform_admin" ON public.user_establishments;
CREATE POLICY "user_establishments_insert_platform_admin"
  ON public.user_establishments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_platform_admin());

DROP POLICY IF EXISTS "user_establishments_update_platform_admin" ON public.user_establishments;
CREATE POLICY "user_establishments_update_platform_admin"
  ON public.user_establishments
  FOR UPDATE
  TO authenticated
  USING (public.current_user_is_platform_admin())
  WITH CHECK (public.current_user_is_platform_admin());

DROP POLICY IF EXISTS "user_establishments_delete_platform_admin" ON public.user_establishments;
CREATE POLICY "user_establishments_delete_platform_admin"
  ON public.user_establishments
  FOR DELETE
  TO authenticated
  USING (public.current_user_is_platform_admin());

-- Recria policies das tabelas de dominio com base em RBAC
DROP POLICY IF EXISTS "tenant_establishments_select" ON public.establishments;
DROP POLICY IF EXISTS "tenant_settings_select" ON public.settings;
DROP POLICY IF EXISTS "tenant_settings_update" ON public.settings;
DROP POLICY IF EXISTS "tenant_settings_insert" ON public.settings;
DROP POLICY IF EXISTS "tenant_import_batches_select" ON public.import_batches;
DROP POLICY IF EXISTS "tenant_import_batches_insert" ON public.import_batches;
DROP POLICY IF EXISTS "tenant_import_batches_update" ON public.import_batches;
DROP POLICY IF EXISTS "tenant_transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "tenant_transactions_insert" ON public.transactions;
DROP POLICY IF EXISTS "tenant_transactions_update" ON public.transactions;
DROP POLICY IF EXISTS "tenant_transactions_delete" ON public.transactions;
DROP POLICY IF EXISTS "tenant_people_count_events_select" ON public.people_count_events;
DROP POLICY IF EXISTS "tenant_people_count_events_insert" ON public.people_count_events;
DROP POLICY IF EXISTS "tenant_people_count_events_update" ON public.people_count_events;
DROP POLICY IF EXISTS "tenant_people_count_events_delete" ON public.people_count_events;
DROP POLICY IF EXISTS "tenant_alerts_select" ON public.alerts;
DROP POLICY IF EXISTS "tenant_alerts_insert" ON public.alerts;
DROP POLICY IF EXISTS "tenant_alerts_update" ON public.alerts;
DROP POLICY IF EXISTS "tenant_alerts_delete" ON public.alerts;
DROP POLICY IF EXISTS "tenant_cash_payment_events_select" ON public.cash_payment_events;
DROP POLICY IF EXISTS "tenant_cash_payment_events_insert" ON public.cash_payment_events;
DROP POLICY IF EXISTS "tenant_cash_payment_events_update" ON public.cash_payment_events;
DROP POLICY IF EXISTS "tenant_cash_payment_events_delete" ON public.cash_payment_events;
DROP POLICY IF EXISTS "tenant_audit_events_select" ON public.audit_events;
DROP POLICY IF EXISTS "tenant_audit_events_insert" ON public.audit_events;
DROP POLICY IF EXISTS "tenant_audit_events_update" ON public.audit_events;
DROP POLICY IF EXISTS "tenant_audit_events_delete" ON public.audit_events;

-- Reexecução segura: políticas RBAC já podem existir com estes nomes
DROP POLICY IF EXISTS "rbac_establishments_select" ON public.establishments;
DROP POLICY IF EXISTS "rbac_settings_all" ON public.settings;
DROP POLICY IF EXISTS "rbac_import_batches_all" ON public.import_batches;
DROP POLICY IF EXISTS "rbac_transactions_all" ON public.transactions;
DROP POLICY IF EXISTS "rbac_people_count_events_all" ON public.people_count_events;
DROP POLICY IF EXISTS "rbac_alerts_all" ON public.alerts;
DROP POLICY IF EXISTS "rbac_cash_payment_events_all" ON public.cash_payment_events;
DROP POLICY IF EXISTS "rbac_audit_events_all" ON public.audit_events;

CREATE POLICY "rbac_establishments_select"
  ON public.establishments
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_platform_admin() OR public.user_has_establishment_access(id));

CREATE POLICY "rbac_settings_all"
  ON public.settings
  FOR ALL
  TO authenticated
  USING (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_import_batches_all"
  ON public.import_batches
  FOR ALL
  TO authenticated
  USING (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_transactions_all"
  ON public.transactions
  FOR ALL
  TO authenticated
  USING (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_people_count_events_all"
  ON public.people_count_events
  FOR ALL
  TO authenticated
  USING (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_alerts_all"
  ON public.alerts
  FOR ALL
  TO authenticated
  USING (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_cash_payment_events_all"
  ON public.cash_payment_events
  FOR ALL
  TO authenticated
  USING (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id));

CREATE POLICY "rbac_audit_events_all"
  ON public.audit_events
  FOR ALL
  TO authenticated
  USING (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.current_user_is_platform_admin() OR public.user_has_establishment_access(establishment_id));

COMMIT;

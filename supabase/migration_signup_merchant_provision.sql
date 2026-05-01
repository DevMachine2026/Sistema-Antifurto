-- =============================================================
-- MIGRATION: provisionamento automático no cadastro (comerciante)
-- Lê raw_user_meta_data: full_name, establishment_name
-- Cria establishment + settings + user_establishments
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
  v_est_name text;
  v_slug text;
  v_eid uuid;
BEGIN
  v_full_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '');

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, v_full_name)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  v_est_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'establishment_name', '')), '');

  IF v_est_name IS NOT NULL AND char_length(v_est_name) >= 2 THEN
    v_slug := regexp_replace(lower(v_est_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' OR char_length(v_slug) < 2 THEN
      v_slug := 'cliente';
    END IF;
    v_slug := v_slug || '-' || substr(replace(NEW.id::text, '-', ''), 1, 12);

    INSERT INTO public.establishments (name, slug, active)
    VALUES (v_est_name, v_slug, true)
    RETURNING id INTO v_eid;

    INSERT INTO public.settings (establishment_id)
    VALUES (v_eid)
    ON CONFLICT (establishment_id) DO NOTHING;

    INSERT INTO public.user_establishments (user_id, establishment_id, role, active)
    VALUES (NEW.id, v_eid, 'owner', true)
    ON CONFLICT (user_id, establishment_id) DO NOTHING;

    UPDATE public.profiles
    SET role = 'merchant_admin'::public.app_role
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- =============================================================
-- Promover usuário existente a administrador da plataforma
-- Executar no SQL Editor do Supabase (após migration_rbac_multitenant.sql)
--
-- 1) Crie o usuário antes: Authentication → Users → Add user
--    ou cadastro/login normal (mesmo email/senha do Auth).
-- 2) Substitua COLOQUE_O_EMAIL_AQUI@exemplo.com pelo email real (2 lugares).
-- 3) Faça logout/login no app para recarregar o perfil.
--
-- Se o UPDATE afetar 0 linhas: não existe profiles para esse user_id.
--   Confira: SELECT id FROM auth.users WHERE lower(email) = lower('...');
--   Se existir id mas sem profile, rode migration_rbac (bloco INSERT profiles)
--   ou: INSERT INTO public.profiles (user_id) VALUES ('<uuid>') ON CONFLICT DO NOTHING;
-- =============================================================

BEGIN;

UPDATE public.profiles
SET role = 'platform_admin'::public.app_role
WHERE user_id = (
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower('COLOQUE_O_EMAIL_AQUI@exemplo.com')
  LIMIT 1
);

-- Confirme: deve retornar 1 linha com role platform_admin
SELECT p.user_id, u.email, p.role, p.full_name
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE lower(u.email) = lower('COLOQUE_O_EMAIL_AQUI@exemplo.com');

COMMIT;

-- Execute no SQL Editor (PRODUCTION) para ver o que já existe.
-- NÃO rode schema.sql inteiro se as tabelas base já existem.

SELECT 'establishments' AS item, EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'establishments'
) AS ok
UNION ALL
SELECT 'agent_configs', EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'agent_configs'
)
UNION ALL
SELECT 'cash_payment_events', EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'cash_payment_events'
)
UNION ALL
SELECT 'profiles (RBAC)', EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'profiles'
)
UNION ALL
SELECT 'cameras', EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'cameras'
)
UNION ALL
SELECT 'evidence_url em people_count', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'people_count_events' AND column_name = 'evidence_url'
)
UNION ALL
SELECT 'get_pos_timeline()', EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_pos_timeline'
)
UNION ALL
SELECT 'policy rbac_settings_tenant', EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'settings' AND policyname = 'rbac_settings_tenant'
)
ORDER BY item;

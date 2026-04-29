-- =============================================================
-- RLS VALIDATION CHECKLIST (execução manual no SQL Editor)
-- Objetivo: confirmar isolamento por tenant nas tabelas sensíveis
-- =============================================================

-- 1) Confirmar RLS habilitado
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'establishments',
    'settings',
    'import_batches',
    'transactions',
    'people_count_events',
    'cash_payment_events',
    'alerts',
    'audit_events'
  )
ORDER BY tablename;

-- 2) Procurar policies legadas permissivas (deve retornar zero linhas)
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'establishments',
    'settings',
    'import_batches',
    'transactions',
    'people_count_events',
    'cash_payment_events',
    'alerts',
    'audit_events'
  )
  AND (
    policyname ILIKE 'service_role_all_%'
    OR coalesce(qual, '') = 'true'
    OR coalesce(with_check, '') = 'true'
  )
ORDER BY tablename, policyname;

-- 3) Inventário de policies ativas por tabela
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'establishments',
    'settings',
    'import_batches',
    'transactions',
    'people_count_events',
    'cash_payment_events',
    'alerts',
    'audit_events'
  )
ORDER BY tablename, policyname;

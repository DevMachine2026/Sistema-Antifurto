-- =============================================================
-- MIGRATION: webhook_token na tabela settings
-- Executar no SQL Editor do Supabase
-- =============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS webhook_token text;

-- Gera token único para o estabelecimento demo
UPDATE settings
SET webhook_token = encode(gen_random_bytes(24), 'hex')
WHERE establishment_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  AND webhook_token IS NULL;

-- Índice para lookup rápido por token
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_webhook_token
  ON settings(webhook_token)
  WHERE webhook_token IS NOT NULL;

-- Retorna o token gerado
SELECT establishment_id, webhook_token FROM settings
WHERE establishment_id = 'aaaaaaaa-0000-0000-0000-000000000001';

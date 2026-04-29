-- Remove secret legado do banco (token de bot Telegram no settings)
-- O token agora deve existir apenas em Supabase Secrets: TELEGRAM_BOT_TOKEN

ALTER TABLE public.settings
DROP COLUMN IF EXISTS telegram_bot_token;

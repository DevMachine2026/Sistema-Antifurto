-- supabase/migration_dvr.sql
-- Estende agent_camera_candidates para suportar DVRs e credenciais auto-detectadas

ALTER TABLE public.agent_camera_candidates
  ADD COLUMN IF NOT EXISTS port              integer,
  ADD COLUMN IF NOT EXISTS service_url       text,
  ADD COLUMN IF NOT EXISTS manufacturer      text,
  ADD COLUMN IF NOT EXISTS device_type       text NOT NULL DEFAULT 'camera',
  ADD COLUMN IF NOT EXISTS channel_count     integer,
  ADD COLUMN IF NOT EXISTS username          text,
  ADD COLUMN IF NOT EXISTS password          text,
  ADD COLUMN IF NOT EXISTS credentials_ok    boolean;

COMMENT ON COLUMN public.agent_camera_candidates.device_type
  IS 'camera | dvr';
COMMENT ON COLUMN public.agent_camera_candidates.credentials_ok
  IS 'true = credenciais padrão verificadas via RTSP probe; false = falhou; null = não testado';

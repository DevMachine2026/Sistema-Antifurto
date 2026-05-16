-- migration_evidence.sql
-- Adiciona evidência visual (frame capturado pelo agente) aos eventos de contagem.
--
-- PASSO MANUAL OBRIGATÓRIO antes de aplicar esta migration:
--   1. Supabase Dashboard → Storage → New bucket
--      Nome: "evidence"  |  Public: true
--      (RLS de leitura pública é aplicado automaticamente em buckets públicos)
--   2. Em seguida execute este arquivo no SQL Editor.

-- Coluna que armazena a URL pública da imagem capturada no momento da detecção
ALTER TABLE people_count_events
  ADD COLUMN IF NOT EXISTS evidence_url text;

COMMENT ON COLUMN people_count_events.evidence_url
  IS 'URL pública do frame JPEG capturado pelo agente no momento da travessia da linha (Supabase Storage, bucket evidence).';

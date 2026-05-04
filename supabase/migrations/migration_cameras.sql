-- Tabela de câmeras registradas por estabelecimento
CREATE TABLE IF NOT EXISTS cameras (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id UUID        NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  camera_id        TEXT        NOT NULL, -- identificador usado nos eventos (channelName no ISAPI)
  ip               TEXT,
  port             INTEGER     NOT NULL DEFAULT 80,
  brand            TEXT        NOT NULL DEFAULT 'generic', -- intelbras | hikvision | dahua | generic
  camera_type      TEXT        NOT NULL DEFAULT 'people_counting', -- people_counting | cash_register
  status           TEXT        NOT NULL DEFAULT 'pending', -- pending | online | offline
  last_event_at    TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- camera_id único por estabelecimento
ALTER TABLE cameras
  ADD CONSTRAINT cameras_establishment_camera_id_unique
  UNIQUE (establishment_id, camera_id);

-- RLS
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cameras_all" ON cameras USING (true) WITH CHECK (true);

-- Trigger updated_at (reutiliza a função já existente no schema)
CREATE TRIGGER cameras_updated_at
  BEFORE UPDATE ON cameras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

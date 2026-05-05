-- supabase/migration_agent.sql

-- Tabela de configuração de agentes
CREATE TABLE IF NOT EXISTS public.agent_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id   uuid REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
  token              text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  name               text NOT NULL,
  cameras            jsonb NOT NULL DEFAULT '[]',
  -- Formato de cada câmera no array cameras:
  -- { "id": "cam-entrada", "ip": "192.168.1.101", "user": "admin",
  --   "pass": "senha", "role": "counting|cash", "name": "Entrada",
  --   "line_y": 0.5, "rtsp_path": "/stream1" }
  thresholds         jsonb NOT NULL DEFAULT '{}',
  heartbeat_interval integer NOT NULL DEFAULT 300,
  active             boolean NOT NULL DEFAULT true,
  last_connected_at  timestamptz,
  config_changed_at  timestamptz NOT NULL DEFAULT now(), -- atualizado pelo AdminPanel ao salvar câmeras
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Saúde em tempo real (upsert por agent_id — só o último heartbeat)
CREATE TABLE IF NOT EXISTS public.agent_heartbeats (
  agent_id         uuid PRIMARY KEY REFERENCES public.agent_configs(id) ON DELETE CASCADE,
  version          text NOT NULL DEFAULT '0.0.0',
  cameras_online   integer NOT NULL DEFAULT 0,
  last_inference   timestamptz,
  reported_at      timestamptz NOT NULL DEFAULT now()
);

-- Câmeras descobertas via ONVIF aguardando aprovação
CREATE TABLE IF NOT EXISTS public.agent_camera_candidates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid REFERENCES public.agent_configs(id) ON DELETE CASCADE NOT NULL,
  ip          text NOT NULL,
  mac         text,
  name        text,
  approved    boolean,          -- NULL = pendente, true = aprovada, false = ignorada
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_agent_configs_establishment
  ON public.agent_configs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_token
  ON public.agent_configs(token);
CREATE INDEX IF NOT EXISTS idx_agent_camera_candidates_agent
  ON public.agent_camera_candidates(agent_id);

-- RLS
ALTER TABLE public.agent_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_heartbeats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_camera_candidates ENABLE ROW LEVEL SECURITY;

-- service_role acessa tudo (Edge Functions usam service_role)
CREATE POLICY "service_role_agent_configs"
  ON public.agent_configs USING (true) WITH CHECK (true);
CREATE POLICY "service_role_agent_heartbeats"
  ON public.agent_heartbeats USING (true) WITH CHECK (true);
CREATE POLICY "service_role_agent_camera_candidates"
  ON public.agent_camera_candidates USING (true) WITH CHECK (true);

-- merchant_admin: acessa apenas seu establishment
CREATE POLICY "merchant_agent_configs_select"
  ON public.agent_configs FOR SELECT TO authenticated
  USING (public.user_has_establishment_access(establishment_id));

CREATE POLICY "merchant_agent_configs_insert"
  ON public.agent_configs FOR INSERT TO authenticated
  WITH CHECK (public.user_has_establishment_access(establishment_id));

CREATE POLICY "merchant_agent_configs_update"
  ON public.agent_configs FOR UPDATE TO authenticated
  USING (public.user_has_establishment_access(establishment_id))
  WITH CHECK (public.user_has_establishment_access(establishment_id));

CREATE POLICY "merchant_agent_heartbeats_select"
  ON public.agent_heartbeats FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_configs ac
      WHERE ac.id = agent_heartbeats.agent_id
        AND public.user_has_establishment_access(ac.establishment_id)
    )
  );

CREATE POLICY "merchant_agent_camera_candidates_select"
  ON public.agent_camera_candidates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_configs ac
      WHERE ac.id = agent_camera_candidates.agent_id
        AND public.user_has_establishment_access(ac.establishment_id)
    )
  );

CREATE POLICY "merchant_agent_camera_candidates_update"
  ON public.agent_camera_candidates FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_configs ac
      WHERE ac.id = agent_camera_candidates.agent_id
        AND public.user_has_establishment_access(ac.establishment_id)
    )
  );

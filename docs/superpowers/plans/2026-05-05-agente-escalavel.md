# Agente Escalável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o agente Python que roda no cliente (PC ou Pi), lê configuração do Supabase por token, descobre câmeras via ONVIF, conta pessoas com YOLOv8-nano e envia eventos para a infraestrutura existente — sem nenhuma configuração on-site além da instalação inicial.

**Architecture:** Agente Python modular com módulos independentes (config-sync, camera-discovery, people-counter, event-publisher, heartbeat) rodando em threads. Lógica de fraude permanece 100% no Postgres. Supabase recebe duas novas tabelas (`agent_configs`, `agent_heartbeats`) e três novas Edge Functions. AdminPanel ganha tela de gestão de agentes.

**Tech Stack:** Python 3.11, Ultralytics YOLOv8 (CPU), OpenCV, httpx, wsdiscovery, SQLite, Docker, Deno/TypeScript (Edge Functions), React/TypeScript (AdminPanel).

---

## Mapa de arquivos

### Novos — Supabase
- `supabase/migration_agent.sql` — tabelas agent_configs + agent_heartbeats + RLS
- `supabase/functions/agent-config/index.ts` — GET config por token
- `supabase/functions/agent-heartbeat/index.ts` — POST heartbeat periódico
- `supabase/functions/agent-cameras-found/index.ts` — POST câmeras descobertas via ONVIF

### Novos — Agente Python
- `agent/requirements.txt`
- `agent/models.py` — dataclasses AgentConfig, Camera, CountEvent, HeartbeatPayload
- `agent/config_sync.py` — busca e monitora config do Supabase
- `agent/event_publisher.py` — POST para webhook-camera + fila SQLite offline
- `agent/heartbeat.py` — heartbeat periódico com stats
- `agent/camera_discovery.py` — ONVIF WS-Discovery
- `agent/people_counter.py` — RTSP + YOLOv8-nano + detecção de cruzamento de linha
- `agent/main.py` — orquestrador: inicializa e conecta todos os módulos
- `agent/Dockerfile`
- `agent/tests/conftest.py`
- `agent/tests/test_models.py`
- `agent/tests/test_config_sync.py`
- `agent/tests/test_event_publisher.py`
- `agent/tests/test_heartbeat.py`
- `agent/tests/test_people_counter.py`

### Modificados — Frontend
- `src/pages/Agents.tsx` — nova página de gestão de agentes (criar)
- `src/components/layout/Shell.tsx` — adicionar tab "Agentes"
- `src/components/layout/AdminShell.tsx` — adicionar nav "Agentes"
- `src/App.tsx` — registrar rota da página Agents

---

## Task 1: Migration SQL — agent_configs + agent_heartbeats

**Files:**
- Create: `supabase/migration_agent.sql`

- [ ] **Step 1: Escrever a migration**

```sql
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
```

- [ ] **Step 2: Aplicar no Supabase**

No painel do Supabase → SQL Editor → cole e execute `supabase/migration_agent.sql`.

Verificar: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'agent_%';`
Esperado: 3 linhas (`agent_configs`, `agent_heartbeats`, `agent_camera_candidates`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migration_agent.sql
git commit -m "feat: migration agent_configs, agent_heartbeats e agent_camera_candidates"
```

---

## Task 2: Edge Function — agent-config

**Files:**
- Create: `supabase/functions/agent-config/index.ts`

Esta função autentica o agente pelo token, devolve configuração completa incluindo `webhook_token` do establishment (necessário para o agente postar em webhook-camera).

- [ ] **Step 1: Criar a Edge Function**

```typescript
// supabase/functions/agent-config/index.ts
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const token = getBearerToken(req);
  if (!token) return json({ error: 'missing_bearer_token' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: agent } = await supabase
    .from('agent_configs')
    .select('id, establishment_id, name, cameras, thresholds, heartbeat_interval, config_changed_at')
    .eq('token', token)
    .eq('active', true)
    .single();

  if (!agent) return json({ error: 'invalid_token' }, 401);

  // Busca webhook_token do establishment para o agente postar em webhook-camera
  const { data: settings } = await supabase
    .from('settings')
    .select('webhook_token')
    .eq('establishment_id', agent.establishment_id)
    .single();

  // Atualiza timestamp de última conexão
  await supabase
    .from('agent_configs')
    .update({ last_connected_at: new Date().toISOString() })
    .eq('id', agent.id);

  return json({
    agent_id: agent.id,
    name: agent.name,
    cameras: agent.cameras,
    thresholds: agent.thresholds,
    heartbeat_interval: agent.heartbeat_interval,
    webhook_token: settings?.webhook_token ?? null,
    config_changed_at: agent.config_changed_at, // agente guarda e envia no heartbeat
    supabase_url: Deno.env.get('SUPABASE_URL'),
  });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy agent-config --project-ref SEU_PROJECT_REF
```

- [ ] **Step 3: Testar com curl**

Primeiro crie um agente no Supabase SQL Editor:
```sql
INSERT INTO public.agent_configs (establishment_id, name, cameras)
SELECT id, 'Agente Teste', '[]'::jsonb
FROM public.establishments LIMIT 1
RETURNING token;
```

Copie o token retornado e teste:
```bash
curl -H "Authorization: Bearer TOKEN_AQUI" \
  https://SEU_REF.supabase.co/functions/v1/agent-config
```

Esperado: JSON com `agent_id`, `cameras`, `webhook_token`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/agent-config/
git commit -m "feat: Edge Function agent-config — serve config por token"
```

---

## Task 3: Edge Function — agent-heartbeat

**Files:**
- Create: `supabase/functions/agent-heartbeat/index.ts`

- [ ] **Step 1: Criar a Edge Function**

```typescript
// supabase/functions/agent-heartbeat/index.ts
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = getBearerToken(req);
  if (!token) return json({ error: 'missing_bearer_token' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: agent } = await supabase
    .from('agent_configs')
    .select('id, config_changed_at')
    .eq('token', token)
    .eq('active', true)
    .single();

  if (!agent) return json({ error: 'invalid_token' }, 401);

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* heartbeat sem body é válido */ }

  const now = new Date().toISOString();

  await supabase
    .from('agent_heartbeats')
    .upsert({
      agent_id:       agent.id,
      version:        body.version ?? '0.0.0',
      cameras_online: body.cameras_online ?? 0,
      last_inference: body.last_inference ?? null,
      reported_at:    now,
    }, { onConflict: 'agent_id' });

  // config_updated: compara config_changed_at do DB (quando admin salvou)
  // com last_config_changed_at que o agente envia (valor que recebeu na última chamada agent-config)
  const dbChangedAt = new Date(agent.config_changed_at).getTime();
  const agentSeenAt = body.last_config_changed_at
    ? new Date(body.last_config_changed_at).getTime()
    : 0;
  const configUpdated = dbChangedAt > agentSeenAt;

  return json({ ok: true, config_updated: configUpdated, server_time: now });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy agent-heartbeat --project-ref SEU_PROJECT_REF
```

- [ ] **Step 3: Testar com curl**

```bash
curl -X POST \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"version":"0.1.0","cameras_online":2}' \
  https://SEU_REF.supabase.co/functions/v1/agent-heartbeat
```

Esperado: `{"ok":true,"config_updated":false,"server_time":"..."}`.

Verificar no Supabase: `SELECT * FROM agent_heartbeats;` deve ter 1 linha.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/agent-heartbeat/
git commit -m "feat: Edge Function agent-heartbeat — saúde do agente com upsert"
```

---

## Task 4: Edge Function — agent-cameras-found

**Files:**
- Create: `supabase/functions/agent-cameras-found/index.ts`

- [ ] **Step 1: Criar a Edge Function**

```typescript
// supabase/functions/agent-cameras-found/index.ts
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = getBearerToken(req);
  if (!token) return json({ error: 'missing_bearer_token' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: agent } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('token', token)
    .eq('active', true)
    .single();

  if (!agent) return json({ error: 'invalid_token' }, 401);

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const cameras: Array<{ ip: string; mac?: string; name?: string }> = body.cameras ?? [];
  if (!Array.isArray(cameras) || cameras.length === 0) {
    return json({ ok: true, inserted: 0 });
  }

  // Insere apenas câmeras que ainda não foram reportadas para este agente
  const { data: existing } = await supabase
    .from('agent_camera_candidates')
    .select('ip')
    .eq('agent_id', agent.id);

  const existingIps = new Set((existing ?? []).map((r: any) => r.ip));
  const newCameras = cameras.filter((c) => !existingIps.has(c.ip));

  if (newCameras.length > 0) {
    await supabase.from('agent_camera_candidates').insert(
      newCameras.map((c) => ({
        agent_id: agent.id,
        ip:       c.ip,
        mac:      c.mac ?? null,
        name:     c.name ?? null,
        approved: null,
      })),
    );
  }

  return json({ ok: true, inserted: newCameras.length });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy agent-cameras-found --project-ref SEU_PROJECT_REF
```

- [ ] **Step 3: Testar com curl**

```bash
curl -X POST \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"cameras":[{"ip":"192.168.1.101","name":"Entrada"},{"ip":"192.168.1.102","name":"Caixa"}]}' \
  https://SEU_REF.supabase.co/functions/v1/agent-cameras-found
```

Esperado: `{"ok":true,"inserted":2}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/agent-cameras-found/
git commit -m "feat: Edge Function agent-cameras-found — ONVIF discovery reporting"
```

---

## Task 5: Agente — models.py e requirements.txt

**Files:**
- Create: `agent/requirements.txt`
- Create: `agent/models.py`
- Create: `agent/tests/conftest.py`
- Create: `agent/tests/test_models.py`

- [ ] **Step 1: Criar requirements.txt**

```text
# agent/requirements.txt
ultralytics==8.3.*
opencv-python-headless==4.10.*
httpx==0.27.*
wsdiscovery==2.1.*
pytest==8.3.*
pytest-mock==3.14.*
```

- [ ] **Step 2: Instalar dependências**

```bash
cd agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Esperado: instalação sem erros. YOLOv8 baixa o pytorch como dependência (~700MB).

- [ ] **Step 3: Escrever o teste dos models**

```python
# agent/tests/test_models.py
import pytest
from agent.models import Camera, AgentConfig, CountEvent, HeartbeatPayload

def test_camera_from_dict_minimal():
    raw = {"id": "cam-1", "ip": "192.168.1.10", "user": "admin", "pass": "1234",
           "role": "counting", "name": "Entrada"}
    cam = Camera.from_dict(raw)
    assert cam.id == "cam-1"
    assert cam.ip == "192.168.1.10"
    assert cam.role == "counting"
    assert cam.line_y == 0.5  # default

def test_camera_from_dict_with_line_y():
    raw = {"id": "c", "ip": "10.0.0.1", "user": "u", "pass": "p",
           "role": "counting", "name": "N", "line_y": 0.3}
    cam = Camera.from_dict(raw)
    assert cam.line_y == 0.3

def test_camera_rtsp_url_default_path():
    cam = Camera(id="c", ip="192.168.1.5", user="admin", password="pass",
                 role="counting", name="N", line_y=0.5, rtsp_path="/stream1")
    assert cam.rtsp_url == "rtsp://admin:pass@192.168.1.5/stream1"

def test_camera_rtsp_url_custom_path():
    cam = Camera(id="c", ip="192.168.1.5", user="u", password="p",
                 role="counting", name="N", line_y=0.5, rtsp_path="/cam/0/h264")
    assert cam.rtsp_url == "rtsp://u:p@192.168.1.5/cam/0/h264"

def test_agent_config_counting_cameras():
    config = AgentConfig(
        agent_id="id-1",
        name="Pi Eduardo",
        cameras=[
            Camera(id="c1", ip="1.2.3.4", user="u", password="p",
                   role="counting", name="N", line_y=0.5, rtsp_path="/s1"),
            Camera(id="c2", ip="1.2.3.5", user="u", password="p",
                   role="cash", name="Caixa", line_y=0.5, rtsp_path="/s1"),
        ],
        thresholds={},
        heartbeat_interval=300,
        webhook_token="tok-abc",
        supabase_url="https://x.supabase.co",
    )
    counting = config.counting_cameras
    assert len(counting) == 1
    assert counting[0].id == "c1"

def test_count_event_fields():
    import datetime
    ev = CountEvent(camera_id="cam-1", count_in=3, count_out=1,
                    people_inside=2, recorded_at=datetime.datetime.utcnow())
    assert ev.people_inside == 2

def test_heartbeat_payload_serialization():
    import datetime
    hb = HeartbeatPayload(version="0.1.0", cameras_online=2,
                          last_inference=datetime.datetime.utcnow(),
                          last_reported_at=None)
    d = hb.to_dict()
    assert d["version"] == "0.1.0"
    assert d["cameras_online"] == 2
    assert "last_inference" in d
```

- [ ] **Step 4: Rodar os testes (devem falhar — models não existe)**

```bash
cd agent && python -m pytest tests/test_models.py -v
```

Esperado: `ModuleNotFoundError: No module named 'agent'`

- [ ] **Step 5: Criar models.py**

```python
# agent/models.py
from __future__ import annotations
import datetime
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class Camera:
    id: str
    ip: str
    user: str
    password: str
    role: str          # "counting" | "cash"
    name: str
    line_y: float      # 0.0–1.0, posição vertical da linha de contagem
    rtsp_path: str

    @property
    def rtsp_url(self) -> str:
        return f"rtsp://{self.user}:{self.password}@{self.ip}{self.rtsp_path}"

    @staticmethod
    def from_dict(d: dict) -> Camera:
        return Camera(
            id=d["id"],
            ip=d["ip"],
            user=d["user"],
            password=d["pass"],
            role=d.get("role", "counting"),
            name=d.get("name", d["id"]),
            line_y=float(d.get("line_y", 0.5)),
            rtsp_path=d.get("rtsp_path", "/stream1"),
        )

@dataclass
class AgentConfig:
    agent_id: str
    name: str
    cameras: list[Camera]
    thresholds: dict
    heartbeat_interval: int
    webhook_token: str
    supabase_url: str
    config_changed_at: str  # ISO timestamp — enviado no heartbeat como last_config_changed_at

    @property
    def counting_cameras(self) -> list[Camera]:
        return [c for c in self.cameras if c.role == "counting"]

    @staticmethod
    def from_dict(d: dict) -> AgentConfig:
        return AgentConfig(
            agent_id=d["agent_id"],
            name=d["name"],
            cameras=[Camera.from_dict(c) for c in d.get("cameras", [])],
            thresholds=d.get("thresholds", {}),
            heartbeat_interval=int(d.get("heartbeat_interval", 300)),
            webhook_token=d["webhook_token"],
            supabase_url=d.get("supabase_url", ""),
            config_changed_at=d.get("config_changed_at", ""),
        )

@dataclass
class CountEvent:
    camera_id: str
    count_in: int
    count_out: int
    people_inside: int
    recorded_at: datetime.datetime

    def to_dict(self) -> dict:
        return {
            "camera_id":     self.camera_id,
            "count_in":      self.count_in,
            "count_out":     self.count_out,
            "people_inside": self.people_inside,
            "recorded_at":   self.recorded_at.isoformat() + "Z",
        }

@dataclass
class HeartbeatPayload:
    version: str
    cameras_online: int
    last_inference: Optional[datetime.datetime]
    last_reported_at: Optional[datetime.datetime]

    def to_dict(self) -> dict:
        return {
            "version":         self.version,
            "cameras_online":  self.cameras_online,
            "last_inference":  self.last_inference.isoformat() + "Z" if self.last_inference else None,
            "last_reported_at": self.last_reported_at.isoformat() + "Z" if self.last_reported_at else None,
        }
```

- [ ] **Step 6: Criar conftest.py**

```python
# agent/tests/conftest.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
```

- [ ] **Step 7: Rodar os testes (devem passar)**

```bash
cd agent && python -m pytest tests/test_models.py -v
```

Esperado: 8 testes `PASSED`.

- [ ] **Step 8: Commit**

```bash
git add agent/
git commit -m "feat: agent models e requirements"
```

---

## Task 6: Agente — config_sync.py

**Files:**
- Create: `agent/config_sync.py`
- Create: `agent/tests/test_config_sync.py`

- [ ] **Step 1: Escrever o teste**

```python
# agent/tests/test_config_sync.py
import pytest
from unittest.mock import MagicMock, patch
from agent.config_sync import ConfigSync
from agent.models import AgentConfig, Camera

FAKE_RESPONSE = {
    "agent_id": "uuid-123",
    "name": "Pi Eduardo",
    "cameras": [
        {"id": "cam-1", "ip": "192.168.1.10", "user": "admin", "pass": "1234",
         "role": "counting", "name": "Entrada", "line_y": 0.5, "rtsp_path": "/stream1"}
    ],
    "thresholds": {"r01_min_people": 5},
    "heartbeat_interval": 300,
    "webhook_token": "wh-tok",
    "supabase_url": "https://x.supabase.co",
    "config_updated": False,
}

def test_fetch_config_success(mocker):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = FAKE_RESPONSE
    mock_response.raise_for_status = MagicMock()

    mocker.patch("httpx.get", return_value=mock_response)

    sync = ConfigSync(
        token="my-token",
        supabase_url="https://x.supabase.co",
    )
    config = sync.fetch()

    assert isinstance(config, AgentConfig)
    assert config.agent_id == "uuid-123"
    assert len(config.cameras) == 1
    assert config.cameras[0].rtsp_url == "rtsp://admin:1234@192.168.1.10/stream1"

def test_fetch_config_invalid_token(mocker):
    import httpx
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "401", request=MagicMock(), response=mock_response
    )
    mocker.patch("httpx.get", return_value=mock_response)

    sync = ConfigSync(token="bad-token", supabase_url="https://x.supabase.co")
    with pytest.raises(Exception, match="401|invalid_token|HTTPStatusError"):
        sync.fetch()
```

- [ ] **Step 2: Rodar (deve falhar)**

```bash
cd agent && python -m pytest tests/test_config_sync.py -v
```

Esperado: `ModuleNotFoundError: No module named 'agent.config_sync'`

- [ ] **Step 3: Implementar config_sync.py**

```python
# agent/config_sync.py
import logging
import httpx
from agent.models import AgentConfig

logger = logging.getLogger(__name__)

class ConfigSync:
    def __init__(self, token: str, supabase_url: str):
        self._token = token
        self._url = f"{supabase_url}/functions/v1/agent-config"

    def fetch(self) -> AgentConfig:
        response = httpx.get(
            self._url,
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        logger.info("config fetched: agent_id=%s cameras=%d",
                    data.get("agent_id"), len(data.get("cameras", [])))
        return AgentConfig.from_dict(data)
```

- [ ] **Step 4: Rodar (deve passar)**

```bash
cd agent && python -m pytest tests/test_config_sync.py -v
```

Esperado: 2 testes `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add agent/config_sync.py agent/tests/test_config_sync.py
git commit -m "feat: agent config_sync — busca config do Supabase por token"
```

---

## Task 7: Agente — event_publisher.py

**Files:**
- Create: `agent/event_publisher.py`
- Create: `agent/tests/test_event_publisher.py`

O publisher mantém uma fila SQLite local. Se a chamada HTTP falhar, o evento fica na fila e é reenviado no próximo ciclo.

- [ ] **Step 1: Escrever o teste**

```python
# agent/tests/test_event_publisher.py
import datetime, json, pytest
from unittest.mock import MagicMock
from agent.event_publisher import EventPublisher
from agent.models import CountEvent

def make_event():
    return CountEvent(
        camera_id="cam-1",
        count_in=3, count_out=1, people_inside=2,
        recorded_at=datetime.datetime(2026, 5, 5, 10, 0, 0),
    )

def test_publish_success(mocker):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    mocker.patch("httpx.post", return_value=mock_resp)

    pub = EventPublisher(webhook_url="https://x.supabase.co/functions/v1/webhook-camera",
                         webhook_token="tok", db_path=":memory:")
    pub.publish(make_event())

    import httpx
    httpx.post.assert_called_once()
    call_kwargs = httpx.post.call_args
    payload = json.loads(call_kwargs.kwargs.get("content") or call_kwargs.args[1])
    assert payload["camera_id"] == "cam-1"
    assert payload["count_in"] == 3
    assert payload["people_inside"] == 2

def test_publish_queues_on_failure(mocker):
    import httpx
    mocker.patch("httpx.post", side_effect=httpx.ConnectError("timeout"))

    pub = EventPublisher(webhook_url="https://x.supabase.co/functions/v1/webhook-camera",
                         webhook_token="tok", db_path=":memory:")
    pub.publish(make_event())

    # Evento deve estar na fila
    assert pub.queue_size() == 1

def test_flush_queue_on_reconnect(mocker):
    import httpx
    # Primeiro falha, depois sucesso
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    call_count = {"n": 0}
    def side_effect(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise httpx.ConnectError("timeout")
        return mock_resp
    mocker.patch("httpx.post", side_effect=side_effect)

    pub = EventPublisher(webhook_url="https://x.supabase.co/functions/v1/webhook-camera",
                         webhook_token="tok", db_path=":memory:")
    pub.publish(make_event())   # falha, vai para fila
    assert pub.queue_size() == 1

    pub.flush_queue()           # sucesso, limpa fila
    assert pub.queue_size() == 0
```

- [ ] **Step 2: Rodar (deve falhar)**

```bash
cd agent && python -m pytest tests/test_event_publisher.py -v
```

- [ ] **Step 3: Implementar event_publisher.py**

```python
# agent/event_publisher.py
import json
import logging
import sqlite3
import datetime
import httpx
from agent.models import CountEvent

logger = logging.getLogger(__name__)

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS pending_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    payload   TEXT NOT NULL,
    created_at TEXT NOT NULL
)
"""

class EventPublisher:
    def __init__(self, webhook_url: str, webhook_token: str, db_path: str = "queue.db"):
        self._url = webhook_url
        self._headers = {
            "Authorization": f"Bearer {webhook_token}",
            "Content-Type": "application/json",
        }
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute(CREATE_TABLE)
        self._db.commit()

    def publish(self, event: CountEvent) -> None:
        payload = json.dumps(event.to_dict())
        try:
            resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=10)
            resp.raise_for_status()
            logger.info("event sent: camera=%s in=%d out=%d inside=%d",
                        event.camera_id, event.count_in, event.count_out, event.people_inside)
        except Exception as exc:
            logger.warning("event queued (send failed: %s)", exc)
            self._db.execute(
                "INSERT INTO pending_events (payload, created_at) VALUES (?, ?)",
                (payload, datetime.datetime.utcnow().isoformat()),
            )
            self._db.commit()

    def flush_queue(self) -> None:
        rows = self._db.execute(
            "SELECT id, payload FROM pending_events ORDER BY id LIMIT 50"
        ).fetchall()
        for row_id, payload in rows:
            try:
                resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=10)
                resp.raise_for_status()
                self._db.execute("DELETE FROM pending_events WHERE id = ?", (row_id,))
                self._db.commit()
                logger.info("queued event %d flushed", row_id)
            except Exception as exc:
                logger.warning("flush failed for event %d: %s", row_id, exc)
                break  # para na primeira falha, tenta novamente no próximo ciclo

    def queue_size(self) -> int:
        return self._db.execute("SELECT COUNT(*) FROM pending_events").fetchone()[0]
```

- [ ] **Step 4: Rodar (deve passar)**

```bash
cd agent && python -m pytest tests/test_event_publisher.py -v
```

Esperado: 3 testes `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add agent/event_publisher.py agent/tests/test_event_publisher.py
git commit -m "feat: agent event_publisher — POST com fila SQLite offline"
```

---

## Task 8: Agente — heartbeat.py

**Files:**
- Create: `agent/heartbeat.py`
- Create: `agent/tests/test_heartbeat.py`

- [ ] **Step 1: Escrever o teste**

```python
# agent/tests/test_heartbeat.py
import datetime, pytest
from unittest.mock import MagicMock
from agent.heartbeat import HeartbeatSender
from agent.models import HeartbeatPayload

def test_send_heartbeat_success(mocker):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True, "config_updated": False}
    mock_resp.raise_for_status = MagicMock()
    mocker.patch("httpx.post", return_value=mock_resp)

    sender = HeartbeatSender(
        token="tok",
        supabase_url="https://x.supabase.co",
        version="0.1.0",
    )
    result = sender.send(cameras_online=2, last_inference=datetime.datetime.utcnow())

    assert result["config_updated"] is False
    import httpx
    httpx.post.assert_called_once()

def test_send_heartbeat_returns_config_updated(mocker):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True, "config_updated": True}
    mock_resp.raise_for_status = MagicMock()
    mocker.patch("httpx.post", return_value=mock_resp)

    sender = HeartbeatSender(token="tok", supabase_url="https://x.supabase.co", version="0.1.0")
    result = sender.send(cameras_online=1, last_inference=None)
    assert result["config_updated"] is True

def test_send_heartbeat_silent_on_error(mocker):
    import httpx
    mocker.patch("httpx.post", side_effect=httpx.ConnectError("timeout"))

    sender = HeartbeatSender(token="tok", supabase_url="https://x.supabase.co", version="0.1.0")
    result = sender.send(cameras_online=0, last_inference=None)
    assert result == {}  # falha silenciosa — heartbeat não é crítico
```

- [ ] **Step 2: Rodar (deve falhar)**

```bash
cd agent && python -m pytest tests/test_heartbeat.py -v
```

- [ ] **Step 3: Implementar heartbeat.py**

```python
# agent/heartbeat.py
import json
import logging
import datetime
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

class HeartbeatSender:
    VERSION = "0.1.0"

    def __init__(self, token: str, supabase_url: str, version: str = VERSION,
                 last_config_changed_at: str = ""):
        self._token = token
        self._url = f"{supabase_url}/functions/v1/agent-heartbeat"
        self._version = version
        self._last_config_changed_at: str = last_config_changed_at

    def send(self, cameras_online: int, last_inference: Optional[datetime.datetime]) -> dict:
        payload = {
            "version":              self._version,
            "cameras_online":       cameras_online,
            "last_inference":       last_inference.isoformat() + "Z" if last_inference else None,
            "last_config_changed_at": self._last_config_changed_at,  # para detectar mudança no admin
        }
        try:
            resp = httpx.post(
                self._url,
                content=json.dumps(payload),
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "Content-Type": "application/json",
                },
                timeout=10,
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info("heartbeat sent: cameras_online=%d config_updated=%s",
                        cameras_online, result.get("config_updated"))
            return result
        except Exception as exc:
            logger.warning("heartbeat failed (non-critical): %s", exc)
            return {}
```

- [ ] **Step 4: Rodar (deve passar)**

```bash
cd agent && python -m pytest tests/test_heartbeat.py -v
```

Esperado: 3 testes `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add agent/heartbeat.py agent/tests/test_heartbeat.py
git commit -m "feat: agent heartbeat — reporte periódico de saúde"
```

---

## Task 9: Agente — people_counter.py

**Files:**
- Create: `agent/people_counter.py`
- Create: `agent/tests/test_people_counter.py`

A lógica de negócio testável é a detecção de cruzamento de linha. A inferência YOLO e captura RTSP são integradas e testadas manualmente.

- [ ] **Step 1: Escrever o teste**

```python
# agent/tests/test_people_counter.py
from agent.people_counter import LineCrossDetector

def test_no_crossing_same_side():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=30)
    direction = det.update_track(track_id=1, centroid_y=40)
    assert direction is None  # ainda acima da linha

def test_crossing_downward_is_out():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=45)   # acima da linha (linha=50)
    direction = det.update_track(track_id=1, centroid_y=55)  # abaixo da linha
    assert direction == "out"

def test_crossing_upward_is_in():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=60)   # abaixo da linha
    direction = det.update_track(track_id=1, centroid_y=40)  # acima da linha
    assert direction == "in"

def test_multiple_tracks_independent():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=40)
    det.update_track(track_id=2, centroid_y=60)
    # Track 1 cruza para baixo
    d1 = det.update_track(track_id=1, centroid_y=60)
    # Track 2 cruza para cima
    d2 = det.update_track(track_id=2, centroid_y=40)
    assert d1 == "out"
    assert d2 == "in"

def test_first_detection_never_crosses():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    # Primeira vez que um track aparece não conta como cruzamento
    direction = det.update_track(track_id=99, centroid_y=60)
    assert direction is None

def test_cleanup_stale_tracks():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=40)
    det.cleanup_stale_tracks(active_ids={2, 3})
    # Track 1 foi removido — nova detecção não cruza
    direction = det.update_track(track_id=1, centroid_y=60)
    assert direction is None
```

- [ ] **Step 2: Rodar (deve falhar)**

```bash
cd agent && python -m pytest tests/test_people_counter.py -v
```

- [ ] **Step 3: Implementar people_counter.py**

```python
# agent/people_counter.py
"""
Detecção de cruzamento de linha virtual para contagem de pessoas.

LineCrossDetector: lógica pura, testável sem câmera.
PeopleCounter: integra RTSP + YOLO + LineCrossDetector (não testado por unit test).
"""
from __future__ import annotations
import datetime
import logging
import threading
from typing import Optional, Callable
from agent.models import Camera, CountEvent

logger = logging.getLogger(__name__)


class LineCrossDetector:
    """Rastreia posição de tracks e detecta cruzamento de linha horizontal."""

    def __init__(self, line_y: float, frame_height: int):
        self._line_px = line_y * frame_height
        self._prev: dict[int, float] = {}  # track_id -> centroid_y anterior

    def update_track(self, track_id: int, centroid_y: float) -> Optional[str]:
        """Atualiza posição do track. Retorna 'in', 'out' ou None."""
        prev_y = self._prev.get(track_id)
        self._prev[track_id] = centroid_y

        if prev_y is None:
            return None  # primeira detecção nunca cruza

        if prev_y < self._line_px <= centroid_y:
            return "out"
        if prev_y >= self._line_px > centroid_y:
            return "in"
        return None

    def cleanup_stale_tracks(self, active_ids: set[int]) -> None:
        """Remove tracks que sumiram do frame."""
        for tid in list(self._prev.keys()):
            if tid not in active_ids:
                del self._prev[tid]


class PeopleCounter:
    """
    Abre stream RTSP de uma câmera, roda YOLOv8-nano,
    chama on_event quando alguém cruza a linha virtual.
    Roda em thread própria.
    """

    def __init__(self, camera: Camera, on_event: Callable[[CountEvent], None]):
        self._camera = camera
        self._on_event = on_event
        self._count_in = 0
        self._count_out = 0
        self._last_inference: Optional[datetime.datetime] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name=f"counter-{self._camera.id}")
        self._thread.start()
        logger.info("people counter started: camera=%s", self._camera.id)

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    @property
    def last_inference(self) -> Optional[datetime.datetime]:
        return self._last_inference

    def _run(self) -> None:
        try:
            import cv2
            from ultralytics import YOLO
        except ImportError as exc:
            logger.error("missing dependency: %s — install requirements.txt", exc)
            return

        model = YOLO("yolov8n.pt")  # baixa na primeira execução (~6MB)
        detector = LineCrossDetector(
            line_y=self._camera.line_y,
            frame_height=480,   # será atualizado após primeiro frame
        )

        cap = cv2.VideoCapture(self._camera.rtsp_url)
        if not cap.isOpened():
            logger.error("cannot open RTSP stream: %s", self._camera.rtsp_url)
            return

        frame_count = 0
        SAMPLE_EVERY = 10  # processa 1 de cada 10 frames (~1 FPS para 10 FPS de câmera)

        while self._running:
            ret, frame = cap.read()
            if not ret:
                logger.warning("camera %s lost, reconnecting...", self._camera.id)
                cap.release()
                import time; time.sleep(5)
                cap = cv2.VideoCapture(self._camera.rtsp_url)
                continue

            frame_count += 1
            if frame_count % SAMPLE_EVERY != 0:
                continue

            h, w = frame.shape[:2]
            detector._line_px = self._camera.line_y * h

            results = model.track(frame, persist=True, classes=[0],  # classe 0 = person
                                  verbose=False, stream=False)

            self._last_inference = datetime.datetime.utcnow()
            active_ids: set[int] = set()

            for result in results:
                if result.boxes is None:
                    continue
                boxes = result.boxes
                if boxes.id is None:
                    continue

                for box, track_id in zip(boxes.xyxy, boxes.id):
                    tid = int(track_id.item())
                    active_ids.add(tid)
                    x1, y1, x2, y2 = box.tolist()
                    centroid_y = (y1 + y2) / 2

                    direction = detector.update_track(tid, centroid_y)
                    if direction == "in":
                        self._count_in += 1
                        self._emit()
                    elif direction == "out":
                        self._count_out += 1
                        self._emit()

            detector.cleanup_stale_tracks(active_ids)

        cap.release()
        logger.info("people counter stopped: camera=%s", self._camera.id)

    def _emit(self) -> None:
        event = CountEvent(
            camera_id=self._camera.id,
            count_in=self._count_in,
            count_out=self._count_out,
            people_inside=max(0, self._count_in - self._count_out),
            recorded_at=datetime.datetime.utcnow(),
        )
        self._on_event(event)
```

- [ ] **Step 4: Rodar os testes (deve passar)**

```bash
cd agent && python -m pytest tests/test_people_counter.py -v
```

Esperado: 6 testes `PASSED` (não precisam de câmera nem YOLO — testam apenas LineCrossDetector).

- [ ] **Step 5: Commit**

```bash
git add agent/people_counter.py agent/tests/test_people_counter.py
git commit -m "feat: agent people_counter — YOLOv8 + detecção de cruzamento de linha"
```

---

## Task 10: Agente — camera_discovery.py

**Files:**
- Create: `agent/camera_discovery.py`

ONVIF WS-Discovery multicast. Não tem unit test direto (depende de rede) — testado manualmente.

- [ ] **Step 1: Implementar camera_discovery.py**

```python
# agent/camera_discovery.py
import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

def discover_cameras(timeout: float = 5.0) -> list[dict]:
    """
    Descobre câmeras via ONVIF WS-Discovery multicast.
    Retorna lista de {ip, name}.
    Requer wsdiscovery instalado.
    """
    try:
        from wsdiscovery import WSDiscovery, QName
    except ImportError:
        logger.warning("wsdiscovery not installed — ONVIF discovery skipped")
        return []

    wsd = WSDiscovery()
    wsd.start()
    services = wsd.searchServices(
        types=[QName("http://www.onvif.org/ver10/network/wsdl", "NetworkVideoTransmitter")],
        timeout=timeout,
    )
    wsd.stop()

    cameras = []
    for svc in services:
        addrs = svc.getXAddrs()
        if not addrs:
            continue
        ip = _extract_ip(addrs[0])
        if ip:
            name = svc.getScopes()[0].getValue() if svc.getScopes() else ip
            cameras.append({"ip": ip, "name": name})
            logger.info("ONVIF discovered: ip=%s name=%s", ip, name)

    return cameras


def _extract_ip(xaddr: str) -> Optional[str]:
    """Extrai o IP de uma URL ONVIF (ex: http://192.168.1.10/onvif/device_service)."""
    try:
        from urllib.parse import urlparse
        return urlparse(xaddr).hostname
    except Exception:
        return None


def report_discovered(
    candidates: list[dict],
    token: str,
    supabase_url: str,
) -> None:
    """Envia câmeras descobertas para o Supabase para aprovação no AdminPanel."""
    if not candidates:
        return
    try:
        resp = httpx.post(
            f"{supabase_url}/functions/v1/agent-cameras-found",
            json={"cameras": candidates},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info("reported %d camera candidates (inserted=%s)",
                    len(candidates), data.get("inserted"))
    except Exception as exc:
        logger.warning("failed to report camera candidates: %s", exc)
```

- [ ] **Step 2: Commit**

```bash
git add agent/camera_discovery.py
git commit -m "feat: agent camera_discovery — ONVIF WS-Discovery"
```

---

## Task 11: Agente — main.py

**Files:**
- Create: `agent/main.py`

- [ ] **Step 1: Implementar main.py**

```python
# agent/main.py
"""
Olho Vivo Agent — entry point.

Variáveis de ambiente obrigatórias:
  ESTABLISHMENT_TOKEN  — token único do estabelecimento (de agent_configs)
  SUPABASE_URL         — URL do projeto Supabase

Opcionais:
  AGENT_VERSION        — versão do agente (default: 0.1.0)
  TOKEN_FILE           — caminho para arquivo com token (alternativa à env var)
"""
import logging
import os
import time
import threading
from typing import Optional

from agent.config_sync import ConfigSync
from agent.camera_discovery import discover_cameras, report_discovered
from agent.event_publisher import EventPublisher
from agent.heartbeat import HeartbeatSender
from agent.people_counter import PeopleCounter
from agent.models import AgentConfig, CountEvent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("agent.main")

VERSION = os.getenv("AGENT_VERSION", "0.1.0")


def load_token() -> str:
    token = os.getenv("ESTABLISHMENT_TOKEN")
    if token:
        return token.strip()
    token_file = os.getenv("TOKEN_FILE", "/boot/olhovivo.token")
    if os.path.exists(token_file):
        with open(token_file) as f:
            return f.read().strip()
    raise RuntimeError(
        "ESTABLISHMENT_TOKEN não configurado. "
        "Defina a variável de ambiente ou crie /boot/olhovivo.token"
    )


def main() -> None:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL não configurada")

    token = load_token()
    logger.info("agent starting v%s", VERSION)

    # 1. Busca configuração inicial
    sync = ConfigSync(token=token, supabase_url=supabase_url)
    config: AgentConfig = sync.fetch()
    logger.info("config loaded: agent=%s cameras=%d", config.name, len(config.cameras))

    # 2. Descoberta ONVIF (background, não bloqueia)
    def run_onvif():
        candidates = discover_cameras(timeout=5.0)
        configured_ips = {c.ip for c in config.cameras}
        new = [c for c in candidates if c["ip"] not in configured_ips]
        if new:
            report_discovered(new, token=token, supabase_url=supabase_url)

    threading.Thread(target=run_onvif, daemon=True, name="onvif-discovery").start()

    # 3. Publisher de eventos (webhook-camera existente)
    publisher = EventPublisher(
        webhook_url=f"{supabase_url}/functions/v1/webhook-camera",
        webhook_token=config.webhook_token,
        db_path="queue.db",
    )

    # 4. Heartbeat sender — passa config_changed_at para detectar mudanças do admin
    heartbeat = HeartbeatSender(
        token=token, supabase_url=supabase_url, version=VERSION,
        last_config_changed_at=config.config_changed_at,
    )

    # 5. Inicia contadores por câmera
    counters: list[PeopleCounter] = []
    for camera in config.counting_cameras:
        counter = PeopleCounter(camera=camera, on_event=publisher.publish)
        counter.start()
        counters.append(counter)

    if not counters:
        logger.warning("nenhuma câmera com role=counting configurada — aguardando config via AdminPanel")

    # 6. Loop principal: heartbeat + re-sync + flush de fila
    heartbeat_interval = config.heartbeat_interval
    last_sync = time.monotonic()

    try:
        while True:
            time.sleep(heartbeat_interval)

            # Flush da fila offline
            publisher.flush_queue()

            # Heartbeat
            last_inference = max(
                (c.last_inference for c in counters if c.last_inference),
                default=None,
            )
            result = heartbeat.send(
                cameras_online=sum(1 for c in counters if c.last_inference),
                last_inference=last_inference,
            )

            # Re-sync se config mudou no AdminPanel
            if result.get("config_updated"):
                logger.info("config updated remotely — reloading")
                try:
                    new_config = sync.fetch()
                    # Para câmeras antigas e inicia com nova config
                    for c in counters:
                        c.stop()
                    counters.clear()
                    config = new_config
                    publisher._headers["Authorization"] = f"Bearer {config.webhook_token}"
                    for camera in config.counting_cameras:
                        counter = PeopleCounter(camera=camera, on_event=publisher.publish)
                        counter.start()
                        counters.append(counter)
                    heartbeat_interval = config.heartbeat_interval
                    heartbeat._last_config_changed_at = config.config_changed_at
                    logger.info("config reloaded: cameras=%d", len(counters))
                except Exception as exc:
                    logger.error("re-sync failed: %s", exc)

    except KeyboardInterrupt:
        logger.info("agent stopping")
        for c in counters:
            c.stop()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Testar localmente (sem câmera real)**

Crie um `.env.local` para teste:
```bash
export ESTABLISHMENT_TOKEN=SEU_TOKEN_DO_SUPABASE
export SUPABASE_URL=https://SEU_REF.supabase.co
```

Execute:
```bash
cd agent
source .venv/bin/activate
source .env.local
python main.py
```

Esperado: logs mostrando config carregada, ONVIF discovery rodando em background, "nenhuma câmera counting configurada" (normal sem câmeras configuradas ainda).

- [ ] **Step 3: Commit**

```bash
git add agent/main.py
git commit -m "feat: agent main — orquestrador com re-sync remoto"
```

---

## Task 12: Agente — Dockerfile

**Files:**
- Create: `agent/Dockerfile`

- [ ] **Step 1: Criar Dockerfile**

```dockerfile
# agent/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Dependências do sistema para OpenCV e YOLO
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libxrender-dev ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pré-baixa o modelo YOLOv8-nano para não precisar de internet em produção
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY . .

ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]
```

- [ ] **Step 2: Build e testar**

```bash
# Build para amd64 (PC Linux) — teste local
cd agent
docker build -t olhovivo-agent:latest .

# Rodar sem câmera para validar inicialização
docker run --rm \
  -e ESTABLISHMENT_TOKEN=SEU_TOKEN \
  -e SUPABASE_URL=https://SEU_REF.supabase.co \
  olhovivo-agent:latest
```

Esperado: container sobe, logs de inicialização, "nenhuma câmera counting configurada".

- [ ] **Step 3: Build para ARM64 (Raspberry Pi 5)**

```bash
# Requer Docker BuildKit com buildx configurado para arm64
docker buildx build \
  --platform linux/arm64 \
  -t ghcr.io/devmachine2026/olhovivo-agent:latest \
  --push \
  .
```

Se não tiver buildx configurado:
```bash
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap
```

- [ ] **Step 4: Commit**

```bash
git add agent/Dockerfile
git commit -m "feat: agent Dockerfile — multi-arch (amd64 + arm64)"
```

---

## Task 13: Frontend — página Agents.tsx

**Files:**
- Create: `src/pages/Agents.tsx`

- [ ] **Step 1: Criar Agents.tsx**

```tsx
// src/pages/Agents.tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, Plus, Camera, Clock, Cpu } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';

interface AgentConfig {
  id: string;
  name: string;
  cameras: CameraConfig[];
  heartbeat_interval: number;
  active: boolean;
  last_connected_at: string | null;
}

interface CameraConfig {
  id: string;
  ip: string;
  role: 'counting' | 'cash';
  name: string;
  line_y: number;
  rtsp_path: string;
}

interface AgentHeartbeat {
  agent_id: string;
  version: string;
  cameras_online: number;
  last_inference: string | null;
  reported_at: string;
}

interface CameraCandidate {
  id: string;
  agent_id: string;
  ip: string;
  mac: string | null;
  name: string | null;
  approved: boolean | null;
}

function isOnline(hb: AgentHeartbeat | undefined): boolean {
  if (!hb) return false;
  return Date.now() - new Date(hb.reported_at).getTime() < 10 * 60 * 1000; // 10 min
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `há ${diff}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  return `há ${Math.floor(diff / 3600)}h`;
}

export default function Agents() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [heartbeats, setHeartbeats] = useState<Record<string, AgentHeartbeat>>({});
  const [candidates, setCandidates] = useState<CameraCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');

  const estId = getCurrentEstablishmentId();

  async function load() {
    setLoading(true);
    const [{ data: agentsData }, { data: hbData }, { data: candData }] = await Promise.all([
      supabase.from('agent_configs').select('*').eq('establishment_id', estId).eq('active', true).order('created_at'),
      supabase.from('agent_heartbeats').select('*'),
      supabase.from('agent_camera_candidates').select('*').is('approved', null),
    ]);

    setAgents(agentsData ?? []);

    const hbMap: Record<string, AgentHeartbeat> = {};
    for (const hb of (hbData ?? [])) hbMap[hb.agent_id] = hb;
    setHeartbeats(hbMap);

    setCandidates(candData ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function createAgent() {
    if (!newAgentName.trim()) return;
    const { error } = await supabase.from('agent_configs').insert({
      establishment_id: estId,
      name: newAgentName.trim(),
      cameras: [],
    });
    if (!error) { setNewAgentName(''); setCreating(false); void load(); }
  }

  async function approveCandidate(candidate: CameraCandidate, agent: AgentConfig) {
    const newCamera: CameraConfig = {
      id: `cam-${candidate.ip.replace(/\./g, '-')}`,
      ip: candidate.ip,
      role: 'counting',
      name: candidate.name ?? candidate.ip,
      line_y: 0.5,
      rtsp_path: '/stream1',
    };
    await Promise.all([
      supabase.from('agent_configs').update({
        cameras: [...agent.cameras, newCamera],
        config_changed_at: new Date().toISOString(), // sinaliza re-sync para o agente
      }).eq('id', agent.id),
      supabase.from('agent_camera_candidates').update({ approved: true }).eq('id', candidate.id),
    ]);
    void load();
  }

  async function ignoreCandidate(candidateId: string) {
    await supabase.from('agent_camera_candidates').update({ approved: false }).eq('id', candidateId);
    void load();
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-text-dim">Carregando...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-text">Agentes</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-xs font-black uppercase tracking-widest"
        >
          <Plus size={14} /> Novo Agente
        </button>
      </div>

      {creating && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-text">Nome do novo agente</p>
          <input
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-bg text-text"
            placeholder="Ex: Pi Eduardo — Restaurante Fortaleza"
            value={newAgentName}
            onChange={e => setNewAgentName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAgent()}
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" onClick={createAgent}
              className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-black uppercase tracking-widest">
              Criar
            </button>
            <button type="button" onClick={() => setCreating(false)}
              className="px-4 py-2 border border-border rounded-lg text-xs font-bold text-text-dim">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {agents.length === 0 && !creating && (
        <div className="text-center py-16 text-text-dim text-sm">
          Nenhum agente configurado. Crie um e instale no cliente.
        </div>
      )}

      {agents.map(agent => {
        const hb = heartbeats[agent.id];
        const online = isOnline(hb);
        const agentCandidates = candidates.filter(c => c.agent_id === agent.id);

        return (
          <div key={agent.id} className="bg-surface border border-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${online ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-text truncate">{agent.name}</p>
                <p className="text-xs text-text-dim">
                  {online
                    ? `Online · v${hb?.version} · ${hb?.cameras_online ?? 0} câmeras ativas · sync ${timeAgo(hb!.reported_at)}`
                    : hb ? `Offline · último contato ${timeAgo(hb.reported_at)}` : 'Nunca conectou'}
                </p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {online ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Token de instalação */}
            <div className="px-4 py-3 bg-bg border-b border-border">
              <p className="text-xs text-text-dim mb-1">Token de instalação</p>
              <AgentToken agentId={agent.id} />
            </div>

            {/* Câmeras configuradas */}
            {agent.cameras.length > 0 && (
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-bold text-text-dim uppercase tracking-wider mb-2">Câmeras configuradas</p>
                <div className="space-y-1.5">
                  {agent.cameras.map(cam => (
                    <div key={cam.id} className="flex items-center gap-2 text-xs text-text">
                      <Camera size={12} className="text-text-dim flex-shrink-0" />
                      <span className="font-mono text-text-dim">{cam.ip}</span>
                      <span className="font-bold">{cam.name}</span>
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${cam.role === 'counting' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {cam.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Câmeras aguardando aprovação */}
            {agentCandidates.length > 0 && (
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">
                  ⚠️ {agentCandidates.length} câmera(s) descoberta(s) via ONVIF — aguardando aprovação
                </p>
                <div className="space-y-2">
                  {agentCandidates.map(cand => (
                    <div key={cand.id} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-text-dim">{cand.ip}</span>
                      <span className="text-text">{cand.name ?? 'câmera sem nome'}</span>
                      <div className="ml-auto flex gap-1.5">
                        <button type="button"
                          onClick={() => approveCandidate(cand, agent)}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold">
                          Aprovar
                        </button>
                        <button type="button"
                          onClick={() => ignoreCandidate(cand.id)}
                          className="px-2 py-1 border border-border rounded text-[10px] font-bold text-text-dim">
                          Ignorar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AgentToken({ agentId }: { agentId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  async function loadToken() {
    const { data } = await supabase
      .from('agent_configs')
      .select('token')
      .eq('id', agentId)
      .single();
    setToken(data?.token ?? null);
    setVisible(true);
  }

  if (!visible) {
    return (
      <button type="button" onClick={loadToken}
        className="text-xs text-primary font-bold hover:underline">
        Mostrar token de instalação
      </button>
    );
  }

  return (
    <code className="text-xs font-mono bg-surface border border-border rounded px-2 py-1 select-all break-all">
      {token ?? 'carregando...'}
    </code>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Agents.tsx
git commit -m "feat: página Agents — gestão de agentes com heartbeat e aprovação ONVIF"
```

---

## Task 14: Frontend — integrar Agents na navegação

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Shell.tsx`
- Modify: `src/components/layout/AdminShell.tsx`

- [ ] **Step 1: Ler Shell.tsx para encontrar onde adicionar o tab**

```bash
grep -n "cameras\|readiness\|integrations\|activeTab" src/components/layout/Shell.tsx | head -20
```

- [ ] **Step 2: Adicionar "agents" ao App.tsx**

Em [src/App.tsx](src/App.tsx), na função `renderContent()`, adicionar antes do `default`:

```tsx
// Adicionar import no topo:
import Agents from './pages/Agents';

// Adicionar case dentro de renderContent():
case 'agents':
  return <Agents />;
```

- [ ] **Step 3: Adicionar tab em Shell.tsx**

Localizar no Shell.tsx o array de itens de navegação (onde ficam `cameras`, `integrations`, `readiness`) e adicionar o item de agentes. O padrão exato depende da estrutura atual do Shell — seguir o mesmo padrão dos itens existentes:

```bash
grep -n "cameras\|'Câmera\|lucide" src/components/layout/Shell.tsx | head -20
```

Adicionar item (seguindo o padrão existente):
```tsx
{ id: 'agents', label: 'Agentes', icon: <Cpu size={18} /> },
```

Importar `Cpu` de `lucide-react` se não estiver importado.

- [ ] **Step 4: Adicionar em AdminShell.tsx**

```bash
grep -n "cameras\|readiness\|nav" src/components/layout/AdminShell.tsx | head -20
```

Adicionar link para `agents` seguindo o padrão existente do AdminShell.

- [ ] **Step 5: Verificar build sem erros**

```bash
npm run lint
```

Esperado: sem erros de TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/Shell.tsx src/components/layout/AdminShell.tsx
git commit -m "feat: integra página Agents na navegação do Shell e AdminShell"
```

---

## Task 15: Teste E2E do fluxo completo

Valida que toda a cadeia funciona: agente → webhook-camera → regra → alerta.

- [ ] **Step 1: Criar agente no Supabase via AdminPanel**

Abrir `npm run dev` → logar → tela Agentes → criar agente "Eduardo Teste" → copiar token.

- [ ] **Step 2: Configurar câmera manualmente no Supabase**

```sql
UPDATE public.agent_configs
SET cameras = '[{
  "id": "cam-entrada",
  "ip": "127.0.0.1",
  "user": "test",
  "pass": "test",
  "role": "counting",
  "name": "Entrada Teste",
  "line_y": 0.5,
  "rtsp_path": "/stream1"
}]'::jsonb
WHERE name = 'Eduardo Teste';
```

- [ ] **Step 3: Simular evento via curl (sem câmera real)**

Buscar o `webhook_token` do establishment:
```sql
SELECT webhook_token FROM public.settings WHERE establishment_id = 'SEU_EST_ID';
```

Enviar evento simulado:
```bash
curl -X POST \
  -H "Authorization: Bearer WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"camera_id":"cam-entrada","count_in":10,"count_out":2,"people_inside":8,"recorded_at":"2026-05-05T20:00:00Z"}' \
  https://SEU_REF.supabase.co/functions/v1/webhook-camera
```

- [ ] **Step 4: Verificar no banco**

```sql
SELECT * FROM public.people_count_events ORDER BY created_at DESC LIMIT 5;
SELECT * FROM public.fraud_alerts ORDER BY created_at DESC LIMIT 5;
```

- [ ] **Step 5: Verificar notificação Telegram**

Se `r01_min_people` threshold for ≤ 8, Eduardo deve receber mensagem no Telegram em segundos.

- [ ] **Step 6: Rodar agente real com câmera de teste**

Se houver câmera disponível (IP na mesma rede):
```bash
ESTABLISHMENT_TOKEN=SEU_TOKEN \
SUPABASE_URL=https://SEU_REF.supabase.co \
python agent/main.py
```

Observar logs: config carregada, câmeras descobertas, inferências rodando.

---

## Resumo — Ordem de execução

```
Task 1  → Migration SQL (Supabase, 15 min)
Task 2  → Edge Function agent-config (20 min)
Task 3  → Edge Function agent-heartbeat (15 min)
Task 4  → Edge Function agent-cameras-found (15 min)
Task 5  → Agent models + requirements (30 min)
Task 6  → Agent config_sync (20 min)
Task 7  → Agent event_publisher (25 min)
Task 8  → Agent heartbeat (20 min)
Task 9  → Agent people_counter (30 min)
Task 10 → Agent camera_discovery (15 min)
Task 11 → Agent main.py (20 min)
Task 12 → Agent Dockerfile (20 min)
Task 13 → Frontend Agents.tsx (40 min)
Task 14 → Navegação (20 min)
Task 15 → Teste E2E (30 min)
```

**Estimativa total Fase 1:** ~6h de desenvolvimento focado.

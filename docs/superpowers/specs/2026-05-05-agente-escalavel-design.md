# Design: Agente Escalável — Olho Vivo

**Data:** 2026-05-05
**Status:** Aprovado
**Produto:** Olho Vivo (Sistema Antifraude para bares e eventos)

---

## 1. Problema

A arquitetura atual exige um Raspberry Pi configurado manualmente em cada cliente (MediaMTX + backend Node.js com IP fixo). Isso torna inviável escalar para todo o Brasil — cada instalação requer visita técnica e configuração on-site.

**Requisitos que o novo design deve satisfazer:**
- Funcionar com qualquer câmera IP (independente do firmware)
- Toda configuração realizada pelo AdminPanel (server-side)
- Zero visitas técnicas após a instalação inicial
- Suportar dois cenários de hardware: cliente tem PC / cliente não tem PC

---

## 2. Decisões de Arquitetura

### 2.1 Sem dependência de firmware de câmera

Câmeras modernas (Intelbras, Hikvision) podem ter People Counting no firmware e enviar webhooks diretamente para o Supabase — mas não podemos assumir isso para todos os clientes. O agente resolve o problema na camada de software, funcionando com qualquer câmera que exponha RTSP.

### 2.2 IA local, não API de nuvem

Contagem de pessoas via YOLOv8-nano rodando localmente no agente. Sem custo por inferência, sem dependência de internet para a detecção. Um frame por segundo é suficiente para contagem de entrada/saída.

### 2.3 Lógica de negócio zero no agente

O agente é um coletor de dados. Regras de fraude (R01, R02, R05) permanecem no Postgres. O agente apenas alimenta os webhooks existentes. Isso mantém as regras auditáveis, versionáveis e alteráveis sem atualizar o agente.

### 2.4 Vídeo ao vivo como módulo futuro

A arquitetura do agente é modular. O módulo de contagem de pessoas (Fase 1) e o módulo de relay de vídeo (Fase 2) são independentes. Implementar vídeo ao vivo não exige reescrever o agente.

---

## 3. Arquitetura Geral

```
[Câmera 1..N — RTSP]
        │ rede local
        ▼
[Agente Olho Vivo]          ← token → lê config do Supabase
  • config-sync             ← GET /agent-config
  • camera-discovery        ← ONVIF WS-Discovery
  • people-counter          ← YOLOv8-nano (CPU)
  • event-publisher         ← POST /webhook-camera (existente)
  • heartbeat               ← POST /agent-heartbeat
        │ HTTPS saída (sem port forwarding)
        ▼
[Supabase]
  • agent_configs           (nova tabela)
  • agent_heartbeats        (nova tabela)
  • people_counts           (existente)
  • fraud_alerts            (existente)
  • Edge Function: agent-config    (nova)
  • Edge Function: agent-heartbeat (nova)
  • Edge Function: webhook-camera  (existente)
  • Motor de regras: run_fraud_rules() (existente)
        │
        ▼
[Telegram / WhatsApp]       [Frontend Vercel]
[Dono do bar]               [AdminPanel — gestão de agentes]
```

---

## 4. O Agente

### 4.1 Ciclo de vida

1. **Boot** — lê `ESTABLISHMENT_TOKEN` (variável de ambiente, arquivo `/boot/olhovivo.token` no Pi, ou parâmetro do instalador)
2. **Config sync** — `GET /functions/v1/agent-config` com o token. Recebe: lista de câmeras (IP, credencial, role), thresholds, heartbeat interval
3. **Camera discovery** — ONVIF WS-Discovery multicast na rede local (:3702). Fallback: ping nos IPs configurados. Câmeras novas encontradas são reportadas ao AdminPanel para aprovação
4. **Inferência** — abre RTSP de cada câmera com `role: counting`. YOLOv8-nano a 1 FPS. Mantém `count_in` / `count_out` por linha virtual configurável
5. **Event publish** — a cada cruzamento detectado, POST para `webhook-camera` com payload padrão. Retry automático. Fila local em SQLite se internet cair
6. **Heartbeat + re-sync** — a cada N minutos (default: 5), reporta saúde e verifica flag `config_updated`. Se verdadeiro, aplica nova config sem reiniciar

### 4.2 Módulos

| Módulo | Função | Fase |
|---|---|---|
| `config-sync` | Token → config do Supabase, re-sync periódico | 1 |
| `camera-discovery` | ONVIF scan + validação de câmeras online | 1 |
| `people-counter` | RTSP + YOLOv8-nano + linha virtual | 1 |
| `event-publisher` | POST webhook-camera, retry, fila offline | 1 |
| `heartbeat` | Saúde periódica, câmeras ativas, versão | 1 |
| `video-relay` | Push RTSP → relay cloud (LiveKit/Mux) | 2 |

### 4.3 Stack

- **Linguagem:** Python 3.11
- **IA:** Ultralytics YOLOv8 (`yolov8n.pt` — ~6MB, CPU-only)
- **Vídeo:** OpenCV (`cv2.VideoCapture` sobre RTSP)
- **HTTP:** `httpx` com retry exponencial
- **Fila offline:** SQLite local
- **Empacotamento:**
  - Linux/Pi: imagem Docker (`ghcr.io/devmachine2026/olhovivo-agent`)
  - Windows: executável PyInstaller + instalador NSIS (`.exe`)

---

## 5. Supabase — Mudanças

### 5.1 Novas tabelas

```sql
-- Configuração de cada agente instalado
CREATE TABLE public.agent_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id   uuid REFERENCES public.establishments(id) NOT NULL,
  token              text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  name               text NOT NULL,           -- "Pi Eduardo" / "PC Caixa"
  cameras            jsonb NOT NULL DEFAULT '[]', -- [{id, ip, user, pass, role, name, line_y}] — line_y: 0.0–1.0, posição vertical da linha virtual de contagem
  thresholds         jsonb NOT NULL DEFAULT '{}', -- parâmetros R01/R02
  heartbeat_interval integer NOT NULL DEFAULT 300, -- segundos
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz DEFAULT now()
);

-- Saúde de cada agente (upsert periódico)
CREATE TABLE public.agent_heartbeats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         uuid REFERENCES public.agent_configs(id) NOT NULL,
  version          text,
  cameras_online   integer DEFAULT 0,
  last_inference   timestamptz,
  reported_at      timestamptz DEFAULT now()
);
```

RLS em ambas as tabelas: merchant_admin acessa apenas seu establishment_id. platform_admin acessa tudo.

### 5.2 Novas Edge Functions

**`agent-config` (GET)**
- Auth: `Authorization: Bearer <token>` (token do agent_configs, não JWT)
- Retorna: `agent_id`, câmeras, thresholds, heartbeat_interval, flag `config_updated`
- O `agent_id` retornado é usado pelo agente em todas as chamadas subsequentes (heartbeat, cameras-found)
- Registra timestamp de última conexão em agent_configs

**`agent-heartbeat` (POST)**
- Payload: `{agent_id, version, cameras_online, last_inference}`
- Upsert em agent_heartbeats
- Retorna: `{config_updated: bool}` — agente re-sync se true

**`agent-cameras-found` (POST)**
- Payload: `{agent_id, cameras: [{ip, mac, name}]}`
- Insere câmeras descobertas como pendentes para aprovação no AdminPanel

---

## 6. AdminPanel — Mudanças

Nova seção **Agentes** no AdminPanel (platform_admin vê todos, merchant_admin vê os seus):

- Lista de agentes com status online/offline (baseado em último heartbeat < 10 min)
- Por agente: câmeras configuradas, câmeras pendentes de aprovação (descobertas via ONVIF)
- Ações: criar agente (gera token), editar câmeras, ajustar thresholds, desativar agente
- Badge de alerta quando agente offline > 30 min

---

## 7. Fluxo de Instalação

### Cenário A — Cliente tem PC Windows

1. Você cria agente no AdminPanel → token gerado automaticamente
2. Você envia link `https://olhovivo.app/install?token=xxx` por WhatsApp
3. Cliente baixa `olhovivo-setup.exe` e executa (duplo clique → avançar → instalar)
4. Instalador configura serviço Windows com o token do link
5. Agente inicia, conecta Supabase, descobre câmeras via ONVIF
6. Você aprova câmeras no AdminPanel → sistema operacional

**Tempo do cliente:** < 5 minutos. **Tempo seu após instalação:** 0.

### Cenário B — Sem PC local (Pi enviado)

1. Você cria agente no AdminPanel → token gerado
2. Você flasha cartão SD com imagem pré-configurada (token em `/boot/olhovivo.token`)
3. Você envia Pi + fonte + cabo de rede pelos Correios com instrução de 2 linhas
4. Cliente conecta cabo de rede + fonte
5. Pi sobe, agente inicializa, aparece online no AdminPanel
6. Você aprova câmeras → sistema operacional

**Tempo do cliente:** < 2 minutos. **Tempo seu após instalação:** 0.

---

## 8. Imagem Pi pré-configurada

- Base: Raspberry Pi OS Lite (64-bit, headless)
- Docker instalado + imagem do agente pré-baixada
- Serviço systemd `olhovivo-agent` com restart automático
- Token gravado em `/boot/olhovivo.token` (partição FAT32 acessível sem Linux)
- Script de auto-update: pull nova imagem Docker semanalmente
- SSH habilitado por chave (apenas sua chave pública) para suporte remoto

---

## 9. O que NÃO muda

- webhook-camera Edge Function existente
- Motor de regras R01/R02/R05 no Postgres
- Notificações Telegram/WhatsApp
- Frontend Vercel completo
- RLS multi-tenant por establishment_id
- RBAC platform_admin / merchant_admin
- Toda a infraestrutura de streaming HLS/MediaMTX (permanece disponível para quem já usa)

---

## 10. Fases de Implementação

### Fase 1 — Validação com Eduardo (MVP)
- [ ] Tabelas `agent_configs` + `agent_heartbeats` + migration
- [ ] Edge Functions `agent-config` e `agent-heartbeat`
- [ ] Agente Python: config-sync + camera-discovery + people-counter + event-publisher + heartbeat
- [ ] Imagem Docker + teste no Pi 5
- [ ] Tela Agentes no AdminPanel (CRUD + status online/offline)
- [ ] Instalador Windows básico (.exe via PyInstaller)

### Fase 2 — Escala
- [ ] Auto-update do agente (pull imagem Docker / update .exe)
- [ ] Módulo video-relay (RTSP → cloud relay)
- [ ] Dashboard de saúde de agentes (uptime, latência, câmeras offline)
- [ ] Imagem Pi automatizada (CI gera SD card image)
- [ ] Detecção de espécie via API de visão (OpenAI Vision)

---

## 11. Decisões Abertas

Nenhuma — todas as decisões arquiteturais foram tomadas e aprovadas durante o brainstorming.

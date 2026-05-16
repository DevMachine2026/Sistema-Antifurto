# Olho Vivo — Sistema Antifraude para Comércio

**Auditoria digital 24/7 que cruza câmeras, vendas e pagamentos para detectar desvios financeiros em tempo real.**

Desenvolvido por **Dev Machine**

---

## O que é

O Olho Vivo é uma plataforma SaaS multi-tenant de prevenção a fraudes para bares, restaurantes e casas de eventos. Ele conecta câmeras IP, dados de vendas e transações financeiras, cruza tudo automaticamente e alerta o dono quando detecta uma inconsistência — salão cheio sem vendas, espécie no caixa sem lançamento, gap entre maquineta e bilheteria.

O sistema roda em três camadas:

| Camada | Onde roda | O que faz |
|---|---|---|
| **Agente local** | PC Windows no estabelecimento | Lê câmeras via RTSP, detecta pessoas com IA, captura evidências visuais |
| **Backend em nuvem** | Supabase (PostgreSQL + Edge Functions) | Recebe eventos, cruza dados, executa regras, dispara alertas |
| **Painel web** | Navegador do gestor | Visualiza métricas, evidências, timeline POS×Vídeo, alertas e configurações |

---

## Como funciona — do dado ao alerta

O sistema opera em cinco etapas em ordem crescente de complexidade:

### Etapa 1 — Entrada de dados

Dados chegam de quatro fontes distintas:

| Fonte | Protocolo | O que gera |
|---|---|---|
| Câmera de contagem (RTSP) | Agente local → webhook | Evento de entrada/saída de pessoa + frame JPEG |
| Câmera do caixa (RTSP) | Agente local → webhook | Detecção de espécie + frame JPEG do momento |
| ST Ingressos | Importação PDF ou webhook | Venda de ingresso com valor e horário |
| PagBank | Importação CSV | Transação de maquineta com método de pagamento |

### Etapa 2 — Processamento na borda (Agente)

O **Agente Olho Vivo** roda num PC comum no estabelecimento (Windows, sem necessidade de admin). Para cada câmera de contagem configurada:

1. Conecta ao stream RTSP da câmera.
2. Roda **YOLOv8-nano** (ONNX) para detectar pessoas em cada frame amostrado.
3. Detecta cruzamento da linha virtual configurada (entrada vs. saída).
4. **No exato momento do cruzamento**, captura o frame OpenCV, comprime em JPEG (640 px, qualidade 72) e envia como base64 junto ao evento.

Para câmeras do caixa, o `CashMonitor` mantém um ring-buffer dos últimos 60 segundos (2 fps) e associa o frame mais próximo a cada evento de detecção de espécie.

### Etapa 3 — Ingestão e armazenamento

As Edge Functions recebem os webhooks do agente (e de câmeras IP com firmware próprio):

- **`webhook-camera`**: valida, deduplica por hash SHA-256, faz upload do JPEG para o bucket `evidence` no Supabase Storage, grava URL em `people_count_events.evidence_url`.
- **`webhook-cash`**: idem para eventos de caixa, grava em `cash_payment_events.evidence_url`.
- **`webhook-st-ingressos`**: recebe vendas da bilheteria em tempo real.

Todos os webhooks têm rate limiting por IP e autenticação por Bearer token (rotacionável no painel).

### Etapa 4 — Motor de regras antifraude

Após cada ingestão, a função PostgreSQL `run_fraud_rules(p_establishment_id)` roda automaticamente e verifica:

| Regra | Condição | Severidade |
|---|---|---|
| **R01 — Salão Cheio, Caixa Vazio** | Mais de N pessoas no salão sem nenhuma venda nos últimos X minutos | Alta |
| **R02 — Gap Financeiro** | Divergência entre PagBank e ST Ingressos acima de R$Y | Alta |
| **R05 — Cash Ghost** | Espécie detectada pela câmera sem lançamento correspondente no ST Ingressos | Alta |

*N, X e Y são configuráveis por estabelecimento em Configurações.*

Quando uma regra dispara, o alerta é gravado no banco e as notificações são enviadas imediatamente via Telegram e/ou WhatsApp.

### Etapa 5 — Visualização e investigação

O gestor abre o painel web e tem acesso a quatro níveis de investigação, do mais simples ao mais profundo:

**Nível 1 — Dashboard**
Visão executiva: pessoas no salão agora, total de vendas, gap financeiro, alertas ativos, gráfico Vendas × Pessoas por hora.

**Nível 2 — Alertas**
Central de alertas com filtros, histórico de resoluções e auditoria de quem resolveu cada ocorrência.

**Nível 3 — Evidências Visuais (EvidenceFeed)**
Faixa horizontal de thumbnails no Dashboard: cada evento de contagem tem o frame capturado no momento exato. Clique para abrir o lightbox com hora, câmera, direção (entrada/saída), contadores acumulados e ocupação do salão naquele instante.

**Nível 4 — POS × Vídeo (Sincronização Total)**
A página mais poderosa do sistema. Cada transação financeira é cruzada com o evento de câmera do caixa mais próximo (janela de ±10 minutos). O resultado é uma timeline com quatro estados:

| Estado | Significado | Risco |
|---|---|---|
| ✅ **Sincronizado** | Transação + câmera dentro da janela | Normal |
| ⚠️ **Sem evidência** | Pagamento em dinheiro sem evento de câmera | Médio |
| 🚨 **Caixa sem venda** | Câmera detectou espécie, mas nenhuma transação foi registrada | Máximo |
| — **Cartão/PIX** | Transação por cartão (câmera não esperada) | Normal |

Cada linha da timeline exibe thumbnail da câmera, horário, valor, método, operador e o delta entre a transação e o evento de câmera. Um clique abre o lightbox com a imagem completa e todos os metadados. O banner vermelho de "Caixa sem venda" é exibido automaticamente quando há eventos órfãos.

---

## Painel web — páginas por função

| Página | Acesso via | Para quê serve |
|---|---|---|
| **Dashboard** | Menu → Dashboard | Visão geral: métricas, gráfico, alertas e feed de evidências |
| **POS × Vídeo** | Menu → POS × Vídeo | Timeline transação ↔ câmera do caixa com evidência visual |
| **Alertas** | Menu → Alertas | Central de alertas com resolução e auditoria |
| **Câmeras** | Menu → Câmeras | Wizard de cadastro, player HLS, varredura de rede |
| **Agentes** | Menu → Agentes | Gestão do agente local: status, câmeras descobertas, aprovação |
| **Importar Dados** | Menu → Importar | Upload de PDF (ST Ingressos) e CSV (PagBank) |
| **Integrações** | Menu → Integrações | URLs de webhook, token, status de cada fonte |
| **Configurações** | Menu → Configurações | Telegram, WhatsApp, regras R01/R02, janela de monitoramento |
| **Prontidão** | Menu → Prontidão | Checklist de saúde antes de abrir o estabelecimento |
| **Trilha de Auditoria** | Menu → Auditoria | Log completo de quem fez o quê e quando |
| **Simulador** | Menu → Simulador | Gera dados de demo para apresentações |
| **Guia de Operação** | Menu → Guia | Manual operacional embutido no app |
| **Implantação** | Menu → Implantação | Fluxo guiado de onboarding para novos estabelecimentos |
| **Painel Admin** | Conta platform_admin | Gestão de clientes, ativar/desativar, registrar bot Telegram |

---

## Agente Olho Vivo (PC do estabelecimento)

### Instalação Windows (usuário final)

O estabelecimento recebe um link que baixa `OlhoVivoSetup_TOKEN_<uuid>.exe`. O token está no nome do arquivo — o instalador extrai e configura tudo automaticamente. Nenhum Python, Docker, ZIP ou terminal é necessário.

```
%LocalAppData%\Programs\Olho Vivo\   ← binários + yolov8n.onnx
%LOCALAPPDATA%\OlhoVivoAgent\
├── .olhovivo.env                     ← token + SUPABASE_ANON_KEY (auto-gerado)
├── agente.log                        ← logs de operação
└── queue.db                          ← fila offline SQLite
```

O agente inicia com o Windows (chave `HKCU\...\Run`) e reconecta automaticamente se a internet cair.

### O que o agente faz

```
RTSP stream
    ↓
YOLOv8-nano (ONNX, CPU)
    ↓ detecta pessoa
LineCrossDetector (linha virtual configurável)
    ↓ cruzamento detectado
OpenCV frame → JPEG 640px q72 → base64
    ↓
webhook-camera (edge function)
    ↓
Supabase Storage (bucket evidence) + people_count_events
    ↓
run_fraud_rules() → alertas → Telegram/WhatsApp
```

Para câmeras do caixa, o `CashMonitor` mantém buffer circular de 60 s (2 fps) para fornecer frame de evidência em qualquer evento de espécie.

### Build e distribuição

```bash
# Criar release automático (GitHub Actions → Windows runner → OlhoVivoSetup.exe)
git tag agent-v0.3.0
git push origin agent-v0.3.0
```

O workflow `.github/workflows/agent-release.yml` gera o ONNX, empacota com PyInstaller (sem console, layout `onedir`) e compila o instalador com Inno Setup.

---

## Motor de regras — detalhes técnicos

As regras rodam em PostgreSQL puro via função `run_fraud_rules(p_establishment_id uuid)`, chamada automaticamente após cada webhook de ingestão. Isso garante que nunca haja lag entre a chegada de um evento e a avaliação de fraude — independente de qual cliente/estabelecimento enviou.

Cada regra usa janelas de tempo configuráveis, lidas da tabela `settings` do estabelecimento. Os alertas gerados são inseridos na tabela `alerts` e propagados via `dispatchAlertNotifications()` (inlined nas Edge Functions para evitar dependências externas no deploy via dashboard).

---

## Banco de dados — migrações em ordem

Execute no Supabase SQL Editor nesta sequência:

```
1.  supabase/schema.sql                           ← estrutura base
2.  supabase/migration_cash_ghost.sql             ← cash_payment_events
3.  supabase/migration_webhooks.sql               ← tokens e settings
4.  supabase/migration_rls_production.sql         ← RLS multi-tenant
5.  supabase/migration_idempotency.sql            ← deduplicação por event_key
6.  supabase/migration_audit_events.sql           ← trilha de auditoria
7.  supabase/migration_remove_telegram_bot_token.sql
8.  supabase/migration_rls_audit_hardening.sql
9.  supabase/migration_rbac_multitenant.sql       ← roles merchant/platform_admin
10. supabase/migration_signup_merchant_provision.sql
11. supabase/migration_agent.sql                  ← agentes, heartbeat, câmeras
12. supabase/migration_multi_camera.sql           ← R01 com múltiplas câmeras
13. supabase/migration_dvr.sql                    ← DVRs e credenciais auto-detectadas
14. supabase/migration_evidence.sql               ← evidence_url em people_count_events
15. supabase/migration_pos_sync.sql               ← evidence_url em cash_payment_events + get_pos_timeline()
```

---

## Edge Functions — deploy

```bash
# Todas as funções (substituir SEU_REF)
for fn in webhook-camera webhook-cash webhook-st-ingressos \
           agent-config agent-heartbeat agent-cameras-found \
           agent-install download-agent \
           send-telegram send-whatsapp telegram-connect; do
  npx supabase functions deploy $fn --project-ref SEU_REF
done
```

**JWT:**
- `download-agent`: manter "Verify JWT" **ativo**
- `agent-config`, `agent-heartbeat`, `agent-cameras-found`: **desativar** "Verify JWT" (usam token próprio)

**Secrets:**
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=SEU_TOKEN --project-ref SEU_REF
supabase secrets set GITHUB_AGENT_INSTALLER_URL="https://github.com/.../OlhoVivoSetup.exe" --project-ref SEU_REF
```

Registrar webhook do bot Telegram: Painel Admin → **Bot Telegram → Registrar Webhook**.

---

## Instalação — ambiente de desenvolvimento

```bash
git clone https://github.com/DevMachine2026/Sistema-Antifurto.git
cd Sistema-Antifurto
npm install
cp .env.example .env    # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev             # http://localhost:3000
```

**Agente Python (Linux/dev):**

```bash
export ESTABLISHMENT_TOKEN="uuid-do-agente"
export SUPABASE_ANON_KEY="chave-anon-public-do-supabase"
export SUPABASE_URL="https://SEU_REF.supabase.co"  # opcional
cd agent && pip install -r requirements.txt
python main.py
```

**Criar platform_admin:**
```sql
UPDATE public.profiles SET role = 'platform_admin'::public.app_role
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'seu@email.com');
```

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite 6 |
| Estilização | TailwindCSS 4 |
| Animações | motion/react |
| Ícones | Lucide React |
| Gráficos | Recharts |
| Parsers | pdfjs-dist (PDF) + papaparse (CSV) |
| Banco / Auth | Supabase — PostgreSQL + Auth + RLS + Edge Functions (Deno) |
| Armazenamento de evidências | Supabase Storage (bucket `evidence`, público) |
| Agente IA | Python 3.11 + YOLOv8-nano (ONNX Runtime) + OpenCV + HTTPX |
| Empacotamento Windows | PyInstaller (sem console, onedir) + Inno Setup |
| CI/CD | GitHub Actions → `OlhoVivoSetup.exe` publicado no GitHub Release |

---

## Papéis de acesso

| Papel | Acesso |
|---|---|
| **merchant_admin** | Dashboard, POS×Vídeo, alertas, câmeras, agentes, importações, configurações, auditoria — tudo do próprio estabelecimento |
| **platform_admin** | Painel de gestão de clientes: ativar/desativar, registrar bot Telegram. Não acessa dados operacionais dos comerciantes. |

---

## Estrutura do projeto

```
src/
├── pages/
│   ├── Dashboard.tsx         ← métricas, gráfico Vendas×Pessoas, EvidenceFeed
│   ├── PosSync.tsx           ← POS × Vídeo: timeline transação ↔ câmera do caixa
│   ├── Alerts.tsx            ← central de alertas com resolução e auditoria
│   ├── Agents.tsx            ← gestão de agentes: status, câmeras, DVRs
│   ├── Cameras.tsx           ← wizard de cadastro e player HLS
│   ├── Readiness.tsx         ← checklist de prontidão operacional
│   ├── Upload.tsx            ← importação PDF e CSV
│   ├── Integrations.tsx      ← webhooks e tokens
│   ├── Settings.tsx          ← regras, notificações, thresholds
│   ├── AuditTrail.tsx        ← trilha de auditoria (120 eventos)
│   ├── Simulator.tsx         ← gerador de dados de demo
│   ├── Guide.tsx             ← guia operacional in-app
│   ├── AdminPanel.tsx        ← painel platform_admin
│   ├── Onboarding.tsx        ← fluxo de onboarding guiado
│   └── Install.tsx           ← download do agente Windows
├── components/layout/
│   ├── Shell.tsx             ← shell do comerciante com navegação
│   └── AdminShell.tsx        ← shell do admin da plataforma
├── lib/
│   ├── supabase.ts
│   ├── tenant.ts             ← isolamento multi-tenant por establishment_id
│   └── authInput.ts
└── services/
    ├── dataService.ts        ← CRUD + getPosTimeline() + getPeopleCount() + ...
    ├── notificationService.ts
    └── auditService.ts

agent/
├── main.py                   ← orquestrador: token, heartbeat, autostart Windows
├── people_counter.py         ← YOLOv8 (ONNX) + LineCrossDetector + captura de frame
├── cash_monitor.py           ← ring-buffer da câmera do caixa (60 s, 2 fps)
├── evidence_uploader.py      ← frame OpenCV → JPEG 640px q72 → base64
├── scanner.py                ← descoberta ONVIF + port-scan ARP + report ao painel
├── event_publisher.py        ← envio de eventos + fila SQLite offline
├── heartbeat.py              ← pulso de vida com token no body
├── config_sync.py            ← busca config no Supabase
├── token_from_name.py        ← extrai TOKEN_* do nome do .exe
├── models.py                 ← dataclasses: Camera, CountEvent, AgentConfig
├── olhovivo-agent.spec       ← PyInstaller spec (sem console, onedir)
├── olhovivo-setup.iss        ← Inno Setup → OlhoVivoSetup.exe
└── tests/                    ← pytest: 52 testes

supabase/
├── schema.sql
├── migration_*.sql           ← 15 migrações em ordem numerada acima
└── functions/
    ├── webhook-camera/       ← ingestão de contagem + upload de evidência
    ├── webhook-cash/         ← ingestão de espécie + upload de evidência
    ├── webhook-st-ingressos/ ← ingestão de vendas da bilheteria
    ├── agent-config/         ← configuração remota do agente
    ├── agent-heartbeat/      ← registro de pulso de vida
    ├── agent-cameras-found/  ← câmeras descobertas pelo scanner
    ├── agent-install/        ← geração de link de instalação
    ├── download-agent/       ← proxy autenticado para o instalador .exe
    ├── send-telegram/        ← envio de mensagem via bot Telegram
    ├── send-whatsapp/        ← envio de mensagem via WhatsApp
    └── telegram-connect/     ← registro do webhook do bot Telegram
```

---

## Status de implementação

| Funcionalidade | Status |
|---|---|
| Banco multi-tenant com RLS | ✅ |
| Autenticação + RBAC (merchant / platform_admin) | ✅ |
| Dashboard com tempo real (Supabase Realtime) | ✅ |
| Motor de regras antifraude R01, R02, R05 (PostgreSQL) | ✅ |
| Notificações Telegram | ✅ testado |
| Notificações WhatsApp | 🔜 requer API externa |
| Importação PDF — ST Ingressos | ✅ |
| Importação CSV — PagBank | ✅ |
| Webhooks de ingestão com rate limiting e deduplicação | ✅ |
| Trilha de auditoria | ✅ |
| Checklist de prontidão operacional | ✅ |
| Simulador de demo | ✅ |
| Painel administrativo da plataforma | ✅ |
| Setup do webhook Telegram (1 clique no AdminPanel) | ✅ |
| **Agente Olho Vivo — YOLOv8 + RTSP + heartbeat** | ✅ testado com webcam |
| **Descoberta automática de câmeras (ONVIF + ARP)** | ✅ |
| **Suporte a DVRs — detecção automática de canais e credenciais** | ✅ |
| **Evidências visuais — frame capturado no evento + EvidenceFeed no Dashboard** | ✅ |
| **POS × Vídeo — timeline transação ↔ câmera do caixa** | ✅ |
| **Build automático do instalador Windows (PyInstaller + Inno + GitHub Actions)** | ✅ |
| Score de risco por operador | 🔜 Fase 2 |
| Relatório automático de turno (WhatsApp/email) | 🔜 Fase 2 |
| Comparativo histórico entre turnos | 🔜 Fase 2 |
| Inteligência de estoque (bar) | 🔜 Fase 2 |

---

## Documentação complementar

| Arquivo | Conteúdo |
|---|---|
| [`MANUAL_IMPLANTACAO_RESTAURANTE.md`](MANUAL_IMPLANTACAO_RESTAURANTE.md) | Guia para o dono do estabelecimento: instalação Windows, câmeras, POS×Vídeo |
| [`RUNBOOK_INCIDENTES.md`](RUNBOOK_INCIDENTES.md) | Diagnóstico e resolução de incidentes em produção |
| [`.github/workflows/agent-release.yml`](.github/workflows/agent-release.yml) | Release automático na tag `agent-v*` |
| [`.github/workflows/build-agent.yml`](.github/workflows/build-agent.yml) | Build manual sem release (`workflow_dispatch`) |

---

**Olho Vivo v1.1 — By Dev Machine**

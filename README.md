# Olho Vivo — Sistema Antifraude para Comércio

**Auditoria digital 24/7 que cruza câmeras, vendas e pagamentos para detectar desvios financeiros em tempo real — para qualquer comércio.**

Desenvolvido por **Dev Machine**

---

## O que o sistema faz

O Olho Vivo monitora o estabelecimento de forma contínua: conta quantas pessoas estão no salão, registra transações financeiras de múltiplas fontes e cruza tudo automaticamente. Quando detecta inconsistência — salão cheio sem vendas, divergência entre maquineta e bilheteria, pagamento em espécie sem registro — dispara um alerta no Telegram do dono em segundos.

### Fontes de dados monitoradas

| Fonte | Como chega | O que gera |
|---|---|---|
| **Câmeras IP** (Intelbras, Hikvision, Dahua) | Agente local via RTSP | Contagem de pessoas em tempo real |
| **Agente Olho Vivo** (PC no estabelecimento) | YOLOv8 na borda | Contagem com IA, sem firmware especial |
| **ST Ingressos** | Webhook ou importação PDF | Vendas da bilheteria |
| **PagBank** | Importação CSV | Transações da maquineta |
| **Câmera no caixa** | Webhook | Detecção de espécie (R05) |

---

## Funcionalidades

### Dashboard
- Consumo do ST Ingressos (total de transações)
- Total de pagamentos PagBank
- Gap financeiro em tempo real (divergência entre fontes)
- Número de pessoas no salão agora
- Gráfico Vendas × Pessoas (por hora)
- Alertas ativos (não resolvidos)
- Status da última importação

### Agentes (Olho Vivo)
- Cadastro de agentes com token único por estabelecimento
- Monitoramento Online/Offline (threshold de 10 minutos de heartbeat)
- Versão do software e tempo de última inferência
- **Descoberta automática de câmeras via ONVIF** na rede local
- **Suporte a DVRs**: detecção automática de tipo, número de canais e credenciais
- Fluxo de aprovação de câmeras e DVRs descobertos (approve / ignore)
- Modal de configuração de DVR: usuário, senha e quantidade de canais
- Reconfiguração remota sem reiniciar o agente (`config_changed_at`)
- Adição manual de câmeras com URL RTSP

### Câmeras (sistema legado / HLS)
- Wizard de cadastro em 5 etapas (marca → IP → nome/tipo → configuração → teste)
- Player de vídeo ao vivo com fallback por snapshot
- Suporte a Intelbras ISAPI, Hikvision, Dahua e genérico
- Modalfullscreen de câmera
- Varredura de rede local para descoberta de IPs

### Alertas
- Central com filtros: Não resolvidos / Resolvidos / Todos
- Severidade por cor (Alta / Média)
- Ação de resolução com registro de quem resolveu
- Notificação de equipe via WhatsApp diretamente do alerta
- Auditoria de cada resolução

### Prontidão Operacional
Checklist de saúde do sistema antes de abrir o estabelecimento:
- Token de webhook configurado
- Notificações configuradas (Telegram ou WhatsApp)
- Câmeras enviando eventos
- Câmera do caixa ativa
- Vendas chegando
- Stream funcionando

### Importação de Dados
- **PDF do ST Ingressos** — parser nativo (pdfjs-dist)
- **CSV do PagBank** — parser nativo (papaparse + template para download)
- Preview antes de confirmar (total, linhas, erros)
- Histórico de importações com status

### Integrações
- Painel de endpoints de webhook por estabelecimento
- Status de cada integração (ativo / aguardando)
- Contagem de eventos e timestamp do último evento
- Geração e rotação de token de autenticação (com audit log)
- URLs e token copiáveis com um clique

### Configurações
- **Telegram**: Chat ID + botão de teste
- **WhatsApp**: Número + botão de teste
- **Regra R01**: threshold de pessoas (10–100) e janela de tempo (10–120 min)
- **Regra R02**: threshold de gap financeiro (R$50–R$2.000)
- **Janela de monitoramento**: horário de início e fim (ex: 18h–04h)
- **Modo Auditoria Estrita**: reforço de logs para compliance
- Todas as alterações registradas na trilha de auditoria

### Trilha de Auditoria
- Log dos últimos 120 eventos
- Tipos rastreados: resolução de alerta, atualização de configurações, rotação de token
- Quem fez, quando, e o contexto completo

### Simulador de Demo
- Limpar todos os dados para uma demonstração limpa
- Simular importação ST Ingressos com valor configurável
- Simular transações PagBank
- Simular eventos de câmera no caixa
- Simular contagem de pessoas com ocupação configurável
- Log visual de cada passo

### Painel Administrativo (platform_admin)
- Lista todos os estabelecimentos cadastrados na plataforma
- KPIs: total, ativos, inativos
- Ativar / desativar estabelecimento com um clique
- **Registrar webhook do bot Telegram** com um clique (chama `telegram-connect?setup=1` automaticamente)
- Acesso restrito — não enxerga dados operacionais dos comerciantes

### Internacionalização
- Interface em Português e Inglês
- Language switcher animado na barra de navegação

---

## Motor de Regras Antifraude

As regras rodam no banco (PostgreSQL) via `run_fraud_rules()`, acionada automaticamente após cada evento.

| Regra | Condição de Disparo | Severidade |
|---|---|---|
| **R01 — Salão Cheio, Caixa Vazio** | Mais de N pessoas no salão sem vendas nos últimos X minutos | Alta |
| **R02 — Gap Financeiro** | Divergência PagBank × ST Ingressos acima de R$Y | Alta |
| **R05 — Cash Ghost** | Espécie detectada pela câmera sem lançamento no ST Ingressos | Alta |

*N, X e Y são configuráveis por estabelecimento em Configurações.*

---

## Agente Olho Vivo (edge device)

No **Windows**, o estabelecimento usa um **instalador** (`OlhoVivoSetup.exe`) gerado no CI: PyInstaller empacota o agente (modo **sem janela de console**) e o **Inno Setup** instala por usuário em `%LocalAppData%\Programs\Olho Vivo` (sem pedir administrador), incluindo o modelo **YOLOv8 em ONNX**. Não é necessário Python, Docker, ZIP nem arquivo `token.txt` manual para o usuário final.

**Token (invisível para o dono do negócio):** o painel dispara o download com um nome de arquivo do tipo `OlhoVivoSetup_TOKEN_<seu_token>.exe`. O instalador e o executável final incorporam esse padrão; o agente grava o token em `%LOCALAPPDATA%\OlhoVivoAgent\.olhovivo.env`, registra logs em `agente.log` na mesma pasta e, ao rodar como `.exe` empacotado, configura **inicialização com o Windows** (`HKCU\...\Run`, valor `OlhoVivoAgent`).

```
PC do estabelecimento (Windows)
└── %LocalAppData%\Programs\Olho Vivo\
    └── OlhoVivo_TOKEN_<id>.exe  (+ DLLs e yolov8n.onnx)
    %LOCALAPPDATA%\OlhoVivoAgent\
    ├── .olhovivo.env            ← token (gerado automaticamente)
    ├── agente.log
    └── queue.db                 ← fila offline
```

O agente:
- Lê câmeras via RTSP
- Detecta pessoas com YOLOv8-nano (ONNX Runtime)
- Envia eventos ao Supabase (com `apikey` + `Authorization` em todos os requests)
- Descobre câmeras ONVIF na rede (com fallback por port-scan via tabela ARP)
- Reporta câmeras descobertas ao painel, incluindo `establishment_token` no corpo da requisição
- Envia heartbeat conforme a configuração (token também no body para identificação)

**Fluxo de implantação (Windows, usuário leigo):**
1. No painel: **Agentes** (ou onboarding) → link de instalação / download do instalador (o navegador salva já com `TOKEN_` no nome).
2. Executar o instalador e avançar nas telas; ao terminar, o agente abre sozinho e passa a subir no boot.
3. Aprovar câmeras descobertas no AdminPanel.

**Desenvolvimento / Linux:** continue usando variável `ESTABLISHMENT_TOKEN` ou `token.txt` ao lado do código, e defina `SUPABASE_ANON_KEY` (obrigatória) conforme [`agent/main.py`](agent/main.py) e `.env.example`.

**Release no GitHub:** o artefato publicado na tag `agent-v*` é o instalador **`OlhoVivoSetup.exe`**, não um ZIP. Quem baixa só o `.exe` genérico do Release precisa passar o token via parâmetro do instalador (`/TOKEN=...`) ou usar sempre o link do painel (nome do arquivo com `TOKEN_`).

Mais detalhes: [`MANUAL_IMPLANTACAO_RESTAURANTE.md`](MANUAL_IMPLANTACAO_RESTAURANTE.md).

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite 6 |
| Estilização | TailwindCSS 4 |
| Banco / Auth | Supabase (PostgreSQL + Auth + RLS + Edge Functions) |
| Gráficos | Recharts |
| Animações | motion/react |
| Ícones | Lucide React |
| Parsers | pdfjs-dist + papaparse |
| Agente (IA) | Python 3.11 + YOLOv8-nano (ONNX) + OpenCV + HTTPX |
| Distribuição do agente (Windows) | PyInstaller (sem console, pasta `onedir`) + Inno Setup + GitHub Actions → `OlhoVivoSetup.exe` |

---

## Papéis de acesso

| Papel | O que acessa |
|---|---|
| **merchant_admin** | Dashboard, alertas, câmeras, agentes, importações, configurações do próprio estabelecimento |
| **platform_admin** | Painel de gestão de clientes — ativa/desativa estabelecimentos. Não acessa dados operacionais. |

---

## Instalação (ambiente de desenvolvimento)

### 1. Frontend

```bash
git clone https://github.com/DevMachine2026/Sistema-Antifurto.git
cd Sistema-Antifurto
npm install
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:3000
```

**Agente (Python):** além de `ESTABLISHMENT_TOKEN`, defina obrigatoriamente:

```bash
export SUPABASE_ANON_KEY="sua_anon_key_aqui"   # chave anon/public do projeto Supabase
export ESTABLISHMENT_TOKEN="uuid-do-agente"
# opcional:
export SUPABASE_URL="https://SEU_REF.supabase.co"
```

Ou coloque no `.env` do agente (lido por `_read_internal_env`):

```
ESTABLISHMENT_TOKEN=uuid-do-agente
SUPABASE_ANON_KEY=sua_anon_key_aqui
```

A `SUPABASE_ANON_KEY` é a chave **anon / public** do projeto, visível em **Project Settings → API** no painel do Supabase. Sem ela todos os requests retornam **401 Unauthorized** (EarlyDrop no gateway do Supabase).

### 2. Banco de dados (Supabase SQL Editor)

Execute os arquivos na ordem:

```
supabase/schema.sql
supabase/migration_cash_ghost.sql
supabase/migration_webhooks.sql
supabase/migration_rls_production.sql
supabase/migration_idempotency.sql
supabase/migration_audit_events.sql
supabase/migration_remove_telegram_bot_token.sql
supabase/migration_rls_audit_hardening.sql
supabase/migration_rbac_multitenant.sql
supabase/migration_signup_merchant_provision.sql
supabase/migration_agent.sql          ← agentes, heartbeat e câmeras
supabase/migration_multi_camera.sql   ← R01 com múltiplas câmeras de contagem
supabase/migration_dvr.sql            ← suporte a DVRs e credenciais auto-detectadas
```

### 3. Edge Functions

```bash
npx supabase functions deploy webhook-camera        --project-ref SEU_REF
npx supabase functions deploy webhook-cash          --project-ref SEU_REF
npx supabase functions deploy webhook-st-ingressos  --project-ref SEU_REF
npx supabase functions deploy agent-config          --project-ref SEU_REF
npx supabase functions deploy agent-heartbeat       --project-ref SEU_REF
npx supabase functions deploy agent-cameras-found   --project-ref SEU_REF
npx supabase functions deploy agent-install         --project-ref SEU_REF
npx supabase functions deploy download-agent       --project-ref SEU_REF
npx supabase functions deploy send-telegram         --project-ref SEU_REF
npx supabase functions deploy send-whatsapp         --project-ref SEU_REF
npx supabase functions deploy telegram-connect      --project-ref SEU_REF
```

Após o deploy de `telegram-connect`, registre o webhook do bot no Telegram. A forma mais simples é usar o botão **Bot Telegram → Registrar Webhook** no Painel Administrativo (`platform_admin`). Alternativamente via curl:

```bash
curl "https://SEU_REF.supabase.co/functions/v1/telegram-connect?setup=1" \
  -H "Authorization: Bearer SEU_JWT"
```

Secret para o proxy do instalador Windows (URL completa do `.exe` no GitHub Releases, sem query string):

```bash
supabase secrets set GITHUB_AGENT_INSTALLER_URL="https://github.com/SEU_ORG/SEU_REPO/releases/latest/download/OlhoVivoSetup.exe" --project-ref SEU_REF
```

Ativar **Verify JWT** na função `download-agent` (somente sessões do painel; o handler confere o agente com RLS usando o JWT do usuário).

Desativar verificação de JWT nas funções do agente (usam token próprio, não JWT):
- `agent-config` → Settings → desativar "Verify JWT"
- `agent-heartbeat` → Settings → desativar "Verify JWT"
- `agent-cameras-found` → Settings → desativar "Verify JWT"

Configurar secret do Telegram:
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=SEU_TOKEN --project-ref SEU_REF
```

### 4. Criar platform_admin

```sql
UPDATE public.profiles
SET role = 'platform_admin'::public.app_role
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'seu@email.com');
```

---

## Gerar nova versão do agente (instalador Windows)

```bash
git tag agent-v0.2.0
git push origin agent-v0.2.0
```

Ao criar uma tag **`agent-v*`** o workflow **Agent Release** (`.github/workflows/agent-release.yml`) roda no Windows: gera o ONNX (Ultralytics), empacota com **PyInstaller** (`agent/olhovivo-agent.spec`, sem console + layout `onedir` via `COLLECT`), compila **`agent/olhovivo-setup.iss`** com **Inno Setup** (`choco install innosetup` + `ISCC.exe` no runner Windows) e publica no **GitHub Release** o arquivo **`OlhoVivoSetup.exe`** (nome fixo para o link `.../latest/download/OlhoVivoSetup.exe`). Para build manual sem release, use **Build Agent** (`.github/workflows/build-agent.yml`, só `workflow_dispatch`).

---

## Estrutura do projeto

```
src/
├── pages/
│   ├── Dashboard.tsx         ← métricas em tempo real
│   ├── Alerts.tsx            ← central de alertas
│   ├── Agents.tsx            ← gestão de agentes Olho Vivo (novo)
│   ├── Cameras.tsx           ← câmeras HLS / legado
│   ├── Readiness.tsx         ← checklist de prontidão operacional
│   ├── Upload.tsx            ← importação PDF e CSV
│   ├── Integrations.tsx      ← webhooks e tokens
│   ├── Settings.tsx          ← regras, notificações, thresholds
│   ├── AuditTrail.tsx        ← trilha de auditoria
│   ├── Simulator.tsx         ← demo e testes
│   ├── Guide.tsx             ← guia operacional in-app
│   ├── AdminPanel.tsx        ← painel platform_admin (gestão de clientes + setup Telegram)
│   ├── Onboarding.tsx        ← fluxo de onboarding guiado
│   ├── Install.tsx           ← download do agente Windows
│   ├── Login.tsx
│   ├── Register.tsx
│   └── SelectEstablishment.tsx
├── components/layout/
│   ├── Shell.tsx             ← shell do comerciante
│   └── AdminShell.tsx        ← shell do admin da plataforma
├── lib/
│   ├── supabase.ts
│   ├── tenant.ts             ← isolamento multi-tenant
│   └── authInput.ts
└── services/
    ├── dataService.ts
    ├── notificationService.ts
    └── auditService.ts

agent/
├── main.py                   ← orquestrador: token, logs, autostart Windows, SUPABASE_ANON_KEY
├── token_from_name.py        ← extrai TOKEN_* do nome do .exe
├── config_sync.py            ← busca config no Supabase (apikey + Authorization)
├── scanner.py                ← descoberta ONVIF + port-scan ARP + report ao painel
├── people_counter.py         ← YOLOv8 (ONNX) + LineCrossDetector
├── event_publisher.py        ← envio de eventos + fila SQLite offline (apikey header)
├── heartbeat.py              ← pulso de vida (establishment_token no body)
├── models.py                 ← dataclasses compartilhadas
├── olhovivo-agent.spec       ← PyInstaller (sem console, onedir)
├── olhovivo-setup.iss        ← Inno Setup → OlhoVivoSetup.exe
└── tests/                    ← pytest: 44 testes (cobertura de headers e body)

supabase/
├── schema.sql
├── migration_*.sql
└── functions/
    ├── webhook-camera/
    ├── webhook-cash/
    ├── webhook-st-ingressos/
    ├── agent-config/
    ├── agent-heartbeat/
    ├── agent-cameras-found/
    ├── agent-install/
    ├── download-agent/
    ├── send-telegram/
    ├── send-whatsapp/
    └── telegram-connect/
```

---

## Status

| Componente | Status |
|---|---|
| Dashboard com tempo real (Supabase realtime) | ✅ |
| Motor de regras R01, R02, R05 (PostgreSQL) | ✅ |
| Banco multi-tenant com RLS | ✅ |
| Autenticação + RBAC (merchant / platform_admin) | ✅ |
| Painel administrativo da plataforma | ✅ |
| Edge Functions (webhooks + notificações + agente) | ✅ |
| Rate limiting em todos os webhooks de ingestão | ✅ |
| Notificações Telegram | ✅ testado |
| Setup do webhook Telegram (1 clique no AdminPanel) | ✅ |
| Notificações WhatsApp | 🔜 requer API externa (`WHATSAPP_*`) |
| Importação PDF (ST Ingressos) | ✅ |
| Importação CSV (PagBank) | ✅ |
| Simulador de demo | ✅ |
| Trilha de auditoria | ✅ |
| Checklist de prontidão operacional | ✅ |
| **Agente Olho Vivo (YOLOv8 + RTSP)** | ✅ testado com webcam |
| **Descoberta ONVIF + port-scan ARP de câmeras** | ✅ |
| **Suporte a DVRs (detecção automática + configuração de canais)** | ✅ |
| **Auth Supabase: apikey + Authorization em todos os requests** | ✅ |
| **Token UUID no body dos POSTs (heartbeat, scanner)** | ✅ |
| **Build automático instalador Windows (PyInstaller + Inno, GitHub Actions)** | ✅ |
| Analítico avançado (Fase 2) | 🔜 |

---

## Documentação complementar

| Arquivo | Conteúdo |
|---|---|
| [`.github/workflows/agent-release.yml`](.github/workflows/agent-release.yml) | Release automático na tag `agent-v*` (Windows → `OlhoVivoSetup.exe` no GitHub Release) |
| [`.github/workflows/build-agent.yml`](.github/workflows/build-agent.yml) | Build manual (`workflow_dispatch`) só gera artifact, sem release |
| [`MANUAL_IMPLANTACAO_RESTAURANTE.md`](MANUAL_IMPLANTACAO_RESTAURANTE.md) | Guia de implantação no restaurante (Windows, instalador, sem ZIP/token manual) |
| [`RUNBOOK_INCIDENTES.md`](RUNBOOK_INCIDENTES.md) | Runbook de incidentes |
| [`CONTEXTO_PROJETO_CONTINUIDADE.md`](CONTEXTO_PROJETO_CONTINUIDADE.md) | Handoff técnico completo |
| [`src/GUIDE.md`](src/GUIDE.md) | Guia operacional exibido dentro do app |

---

**Olho Vivo v1.0 — By Dev Machine**

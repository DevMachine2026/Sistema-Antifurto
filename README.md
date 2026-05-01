# Sistema Antifraude para Bares e Eventos

Sistema inteligente de monitoramento e auditoria em tempo real que cruza dados de múltiplas fontes para identificar desvios financeiros e operacionais em estabelecimentos comerciais.

**Desenvolvido por Dev Machine**

---

## Visão Geral

O Sistema Antifraude funciona como um **Auditor Digital 24/7** que monitora quatro pilares:

1. **Câmeras de Contagem** — Fluxo de pessoas no salão em tempo real (Intelbras ISAPI ou genérico)
2. **Câmera no Caixa** — Detecção de pagamento em espécie (Raspberry Pi + visão computacional)
3. **Maquineta de Pagamento** — Transações financeiras (PagBank — CSV ou API futura)
4. **Sistema de Bilheteria** — Registro de vendas (ST Ingressos — webhook ou PDF)

Ao cruzar essas fontes, o sistema identifica automaticamente inconsistências que indicam fraudes, erros operacionais ou desvios de caixa, e dispara alertas em tempo real via Telegram e WhatsApp.

---

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite 6 |
| Estilização | TailwindCSS 4 |
| Backend / Banco | Supabase (PostgreSQL + Auth + RLS + Edge Functions) |
| Gráficos | Recharts |
| Animações | motion/react |
| Ícones | Lucide React |
| Parsers | pdfjs-dist (ST Ingressos PDF) + papaparse (PagBank CSV) |

---

## Acesso e Papéis

O sistema possui dois papéis distintos:

| Papel | Acesso |
|-------|--------|
| **platform_admin** | Painel de gestão de clientes (ativar/desativar estabelecimentos). Não acessa dados operacionais dos comerciantes. |
| **merchant_admin** | Dashboard de monitoramento do próprio estabelecimento (alertas, câmeras, importações). |

### Criar um platform_admin

1. Criar o usuário em **Supabase > Authentication > Users**
2. Executar no SQL Editor (substituir o email):

```sql
UPDATE public.profiles
SET role = 'platform_admin'::public.app_role
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'seu@email.com');
```

### Cadastrar um comerciante

O próprio comerciante se cadastra pelo botão **"Cadastrar meu comércio"** na tela de login.  
A migration `migration_signup_merchant_provision.sql` cria automaticamente o estabelecimento e o vínculo.

---

## Instalação

### Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Supabase CLI (para deploy das Edge Functions)

### 1. Clone e instale

```bash
git clone https://github.com/DevMachine2026/Sistema-Antifurto.git
cd Sistema-Antifurto
npm install
```

### 2. Configure o banco de dados

No **SQL Editor** do Supabase, execute os arquivos na ordem abaixo:

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
supabase/rules_integration_tests.sql   ← testes com ROLLBACK (não polui dados)
```

Opcionalmente execute `supabase/seed_demo.sql` para dados de demonstração.

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 4. Deploy das Edge Functions

```bash
npx supabase functions deploy webhook-camera        --project-ref SEU_REF
npx supabase functions deploy webhook-cash          --project-ref SEU_REF
npx supabase functions deploy webhook-st-ingressos  --project-ref SEU_REF
npx supabase functions deploy send-telegram         --project-ref SEU_REF
```

Configure o token do bot Telegram:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=1234567890:AAF... --project-ref SEU_REF
```

### 5. Execute

```bash
npm run dev   # http://localhost:3000
```

---

## Motor de Regras Antifraude

| Regra | Gatilho | Severidade |
|-------|---------|------------|
| **R01** — Salão Cheio, Caixa Vazio | >30 pessoas sem vendas nos últimos 30 min | Alta |
| **R02** — Gap Financeiro | Divergência PagBank vs ST Ingressos > R$200 | Alta |
| **R05** — Cash Ghost | Cédula detectada pela câmera sem lançamento no ST Ingressos | Alta |

As regras rodam no banco via `run_fraud_rules()` (PostgreSQL), acionada automaticamente após cada evento recebido via webhook ou importação.

---

## Integrações via Webhook

Todas as integrações usam autenticação **Bearer token**, gerado automaticamente por estabelecimento e gerenciado na aba **Integrações** do sistema.

### Câmera de contagem de pessoas

**Endpoint:** `POST /functions/v1/webhook-camera`  
**Header:** `Authorization: Bearer SEU_TOKEN`

Suporta dois formatos:

**Formato Intelbras ISAPI (plug-and-play):**
```json
{
  "channelName": "cam-area-01",
  "dateTime": "2026-04-29T21:00:00Z",
  "peopleCounting": {
    "enter": 60,
    "exit": 5,
    "people": 55
  }
}
```

**Formato genérico (Raspberry Pi ou script customizado):**
```json
{
  "camera_id": "cam-area-01",
  "count_in": 60,
  "count_out": 5,
  "people_inside": 55,
  "recorded_at": "2026-04-29T21:00:00Z"
}
```

**IDs de câmera recomendados:**
- `cam-area-01` — câmera de contagem (ambiente principal)
- `cam-area-02` — câmera de contagem (segundo ambiente)
- `cam-caixa` — câmera de detecção de espécie na bilheteria

---

### Detecção de dinheiro no caixa (R05)

**Endpoint:** `POST /functions/v1/webhook-cash`  
**Header:** `Authorization: Bearer SEU_TOKEN`

```json
{
  "camera_id": "cam-caixa",
  "detected_at": "2026-04-29T21:15:00Z",
  "confidence": 0.92,
  "window_minutes": 15
}
```

> Detecções com `confidence < 0.7` são ignoradas automaticamente.

---

### ST Ingressos (vendas da bilheteria)

**Endpoint:** `POST /functions/v1/webhook-st-ingressos`  
**Header:** `Authorization: Bearer SEU_TOKEN`

Aceita objeto único ou array de transações:

```json
[
  {
    "amount": 45.00,
    "occurred_at": "2026-04-29T21:10:00Z",
    "payment_method": "pix",
    "operator_id": "op-01",
    "transaction_id": "ST-00123"
  }
]
```

**Campos de `payment_method` aceitos:** `pix`, `credito`, `debito`, `dinheiro`, `especie`, `cash`

Alternativamente, o operador pode importar o PDF do ST Ingressos manualmente na tela **Importar Dados**.

---

### PagBank (maquineta)

Import manual via CSV na tela **Importar Dados**.  
Exportar o relatório de transações no app PagBank e fazer upload no sistema.

---

## Roteiro de Instalação no Cliente

```
1. Cadastrar o estabelecimento no sistema (tela de registro)
2. Acessar Integrações → copiar token + URLs dos webhooks
3. Técnico das câmeras Intelbras: configurar evento de people counting
   apontando para webhook-camera com o Bearer token
4. Equipe ST Ingressos: configurar webhook de saída com a URL + token
5. Raspberry Pi (caixa): apontar script para webhook-cash com o token
6. Testar via botão "Simular Alerta" no sistema
7. Verificar aba Integrações: status deve ficar "Ativo"
8. Configurar WhatsApp e Telegram em Configurações
```

---

## Funcionalidades

- **Dashboard** — Métricas em tempo real: consumo, maquineta, gap financeiro, pessoas no salão
- **Central de Alertas** — Histórico, resolução e auditoria de alertas por regra
- **Importação de Arquivos** — PDF do ST Ingressos e CSV do PagBank (parsers nativos)
- **Motor de Regras** — R01, R02 e R05 executando no banco (PostgreSQL)
- **Notificações Telegram** — Alertas automáticos via bot (token no backend)
- **Notificações WhatsApp** — Push nativo + deep link para mensagem pronta
- **Simulador Demo** — 5 passos interativos para demonstrar o sistema ao cliente
- **Integrações** — Gestão de webhooks, token de autenticação por estabelecimento
- **Configurações** — Thresholds, canais de notificação e modo de auditoria
- **Trilha de Auditoria** — Histórico de ações críticas (settings, token, resolução de alertas)
- **Painel Admin Plataforma** — Gestão de clientes (platform_admin): ativar/desativar estabelecimentos

---

## Estrutura do Projeto

```
src/
├── pages/
│   ├── Dashboard.tsx
│   ├── Alerts.tsx
│   ├── Upload.tsx
│   ├── Settings.tsx
│   ├── Simulator.tsx
│   ├── Integrations.tsx
│   ├── AuditTrail.tsx
│   ├── Guide.tsx
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── SelectEstablishment.tsx
│   └── AdminPanel.tsx            ← painel platform_admin
├── components/layout/
│   ├── Shell.tsx                 ← shell do comerciante
│   └── AdminShell.tsx            ← shell do admin da plataforma
├── lib/
│   ├── supabase.ts
│   ├── tenant.ts                 ← isolamento por estabelecimento
│   └── authInput.ts
├── services/
│   ├── dataService.ts
│   ├── notificationService.ts
│   └── auditService.ts
└── GUIDE.md                      ← guia operacional (exibido no app)
supabase/
├── schema.sql
├── migration_*.sql
├── promote_platform_admin.sql    ← script manual de promoção
├── rules_integration_tests.sql
└── functions/
    ├── webhook-camera/
    ├── webhook-cash/
    ├── webhook-st-ingressos/
    └── send-telegram/
```

---

## Status

| Componente | Status |
|-----------|--------|
| Interface (Dashboard, Alertas, Uploads, Configurações) | ✅ Completo |
| Motor de Regras (R01, R02, R05) | ✅ Completo |
| Banco de Dados + RLS multi-tenant | ✅ Completo |
| Autenticação (login, registro, recuperação de senha) | ✅ Completo |
| Multi-estabelecimento (RBAC) | ✅ Completo |
| Painel Admin Plataforma | ✅ Completo |
| Webhooks / Edge Functions | ✅ Completo |
| Notificações Telegram | ✅ Completo |
| Notificações WhatsApp | ✅ Completo |
| Simulador de Demo | ✅ Completo |
| Parser PDF (ST Ingressos) | ✅ Completo |
| Parser CSV (PagBank) | ✅ Completo |
| Analítico avançado (Fase 2) | 🔜 Pendente |

---

## Documentação operacional

- `CHECKLIST_PRODUCAO.md` — checklist de go-live
- `RUNBOOK_INCIDENTES.md` — runbook de incidentes
- `CONTEXTO_PROJETO_CONTINUIDADE.md` — handoff técnico completo
- `supabase/observability_queries.sql` — queries de observabilidade
- `src/GUIDE.md` — guia de uso operacional (exibido dentro do app)

---

**Sistema Antifraude v1.0 — By Dev Machine**

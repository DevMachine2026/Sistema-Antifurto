# Sistema Antifraude para Bares e Eventos

Sistema inteligente de monitoramento e auditoria em tempo real que cruza dados de múltiplas fontes para identificar desvios financeiros e operacionais em estabelecimentos comerciais.

**Desenvolvido por Dev Machine**

---

## Visão Geral

O Sistema Antifraude funciona como um **Auditor Digital 24/7** que monitora quatro pilares:

1. **Câmeras Inteligentes** — Contagem de pessoas em tempo real (Intelbras ISAPI)
2. **Câmera no Caixa** — Detecção de pagamento em espécie (Raspberry Pi + OpenCV)
3. **Maquinetas de Pagamento** — Transações financeiras (PagBank)
4. **Sistema de Pedidos** — Registro de vendas (ST Ingressos API ou PDF)

Ao cruzar essas informações, o sistema identifica automaticamente inconsistências que indicam fraudes, erros operacionais ou desvios de caixa.

---

## Tecnologias

- **Frontend:** React 19 + TypeScript + Vite 6
- **Banco de Dados:** Supabase (PostgreSQL + Edge Functions)
- **Estilização:** TailwindCSS 4
- **Gráficos:** Recharts
- **Animações:** Framer Motion
- **Ícones:** Lucide React
- **Parsers:** pdfjs-dist (ST Ingressos PDF) + papaparse (PagBank CSV)

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

No dashboard do Supabase, vá em **SQL Editor** e execute em ordem:

```
supabase/schema.sql               # Schema principal
supabase/migration_cash_ghost.sql # Tabela cash_payment_events + R05
supabase/migration_webhooks.sql   # webhook_token na tabela settings
supabase/migration_rls_production.sql # RLS por tenant (produção)
supabase/migration_idempotency.sql # deduplicação por external_event_key
supabase/migration_audit_events.sql # trilha de auditoria operacional
supabase/rules_integration_tests.sql # testes SQL de integração R01/R02/R05
```

Opcionalmente execute `supabase/seed_demo.sql` para dados de demonstração.

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ESTABLISHMENT_ID=aaaaaaaa-0000-0000-0000-000000000001
```

### 4. Deploy das Edge Functions

```bash
npx supabase functions deploy webhook-camera --project-ref SEU_PROJECT_REF
npx supabase functions deploy webhook-cash --project-ref SEU_PROJECT_REF
npx supabase functions deploy webhook-st-ingressos --project-ref SEU_PROJECT_REF
```

### 5. Execute

```bash
npm run dev
```

Disponível em `http://localhost:3000`

---

## Motor de Regras Antifraude

| Regra | Gatilho | Severidade |
|-------|---------|------------|
| **R01** — Salão Cheio, Caixa Vazio | >30 pessoas sem vendas nos últimos 30 min | Alta |
| **R02** — Gap Financeiro | Divergência PagBank vs ST Ingressos > R$200 | Alta |
| **R05** — Cash Ghost | Cédula detectada pela câmera sem lançamento no ST Ingressos | Alta |

As regras rodam no banco via função PostgreSQL `run_fraud_rules()`, acionada automaticamente após cada evento recebido.

### Testes de integração das regras (SQL)

Para validar R01, R02 e R05 de ponta a ponta no banco:

```sql
supabase/rules_integration_tests.sql
```

O script cria dados temporários, executa asserts e finaliza com `ROLLBACK` (sem poluir o ambiente).

---

## Integrações via Webhook

Todas as integrações usam autenticação Bearer token, gerenciado na aba **Integrações** do sistema.

| Integração | Endpoint | Formato |
|-----------|----------|---------|
| Câmera contagem (Intelbras) | `/functions/v1/webhook-camera` | Intelbras ISAPI ou genérico |
| Detecção de espécie (Raspberry Pi) | `/functions/v1/webhook-cash` | JSON customizado |
| ST Ingressos API | `/functions/v1/webhook-st-ingressos` | JSON único ou array |

---

## Funcionalidades

- **Dashboard** — Métricas em tempo real + gráfico vendas vs. ocupação
- **Central de Alertas** — Histórico, resolução e auditoria de alertas
- **Importação de Arquivos** — PDF do ST Ingressos e CSV do PagBank (parsers reais)
- **Motor de Regras** — R01, R02 e R05 rodando no banco (PostgreSQL)
- **Notificações Telegram** — Alertas automáticos via bot
- **Notificações WhatsApp** — Push nativo + deep link
- **Simulador Demo** — 5 passos interativos incluindo detecção de espécie
- **Integrações** — Gestão de webhooks e token de autenticação
- **Configurações** — Thresholds, canais de notificação e modo de auditoria
- **Trilha de Auditoria** — Histórico de ações críticas (settings, token e resolução de alertas)

---

## Estrutura do Projeto

```
src/
├── lib/
│   ├── supabase.ts              # Client Supabase
│   └── parsers/
│       ├── stIngressosParser.ts # Parser PDF ST Ingressos
│       └── pagbankParser.ts     # Parser CSV PagBank
├── services/
│   ├── dataService.ts           # CRUD + motor de regras
│   ├── notificationService.ts   # Telegram + WhatsApp
│   └── auditService.ts          # Persistência de eventos de auditoria
├── pages/
│   ├── Dashboard.tsx
│   ├── Alerts.tsx
│   ├── Upload.tsx
│   ├── Settings.tsx
│   ├── Simulator.tsx
│   ├── Integrations.tsx         # Gestão de webhooks
│   ├── AuditTrail.tsx           # Trilha de auditoria operacional
│   └── Guide.tsx
└── components/layout/Shell.tsx
supabase/
├── schema.sql
├── seed_demo.sql
├── migration_cash_ghost.sql     # R05 + cash_payment_events
├── migration_webhooks.sql       # webhook_token
├── migration_rls_production.sql # RLS por tenant (produção)
├── migration_idempotency.sql    # chaves de idempotência
├── migration_audit_events.sql   # trilha de auditoria
├── rules_integration_tests.sql  # testes SQL R01/R02/R05
└── functions/
    ├── webhook-camera/          # Edge Function — Intelbras ISAPI
    ├── webhook-cash/            # Edge Function — Raspberry Pi
    └── webhook-st-ingressos/    # Edge Function — ST Ingressos API
```

---

## Status

| Componente | Status |
|-----------|--------|
| Interface | Completo |
| Motor de Regras (R01, R02, R05) | Completo |
| Banco de Dados (Supabase) | Completo |
| Notificações Telegram | Completo |
| Notificações WhatsApp | Completo |
| Simulador de Demo | Completo |
| Parser PDF (ST Ingressos) | Completo |
| Parser CSV (PagBank) | Completo |
| Webhooks / Edge Functions | Completo |
| Página de Integrações | Completo |
| Autenticação de usuários | Pendente |
| Multi-estabelecimento | Pendente |

---

**Sistema Antifraude v1.0 — By Dev Machine**

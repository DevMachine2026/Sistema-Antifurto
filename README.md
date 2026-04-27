# Sistema Antifraude para Bares e Eventos

Sistema inteligente de monitoramento e auditoria em tempo real que cruza dados de múltiplas fontes para identificar desvios financeiros e operacionais em estabelecimentos comerciais.

**Desenvolvido por RonalDigital**

---

## Visão Geral

O Sistema Antifraude funciona como um **Auditor Digital 24/7** que monitora três pilares:

1. **Câmeras Inteligentes** — Contagem de pessoas em tempo real
2. **Maquinetas de Pagamento** — Transações financeiras (PagBank)
3. **Sistema de Pedidos** — Registro de vendas (ST Ingressos)

Ao cruzar essas informações, o sistema identifica automaticamente inconsistências que podem indicar fraudes, erros operacionais ou falhas de processo.

---

## Tecnologias

- **Frontend:** React 19 + TypeScript
- **Banco de Dados:** Supabase (PostgreSQL)
- **Estilização:** TailwindCSS 4
- **Gráficos:** Recharts
- **Animações:** Framer Motion (`motion`)
- **Build:** Vite 6
- **Ícones:** Lucide React

---

## Instalação

### Pré-requisitos
- Node.js 18+
- Conta no [Supabase](https://supabase.com)

### 1. Clone e instale

```bash
git clone [url-do-repositorio]
cd sistema-antifraude
npm install
```

### 2. Configure o banco de dados

No dashboard do Supabase, vá em **SQL Editor** e execute o conteúdo de `supabase/schema.sql`.

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais do Supabase (Settings → API):

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 4. Execute

```bash
npm run dev
```

O sistema estará disponível em `http://localhost:3000`

---

## Motor de Regras Antifraude

| Regra | Gatilho | Severidade |
|-------|---------|------------|
| **R01** — Salão Cheio, Caixa Vazio | >30 pessoas sem vendas nos últimos 30 min | Alta |
| **R02** — Gap Financeiro | Divergência PagBank vs ST Ingressos > R$200 | Alta |

As regras rodam no banco de dados via função PostgreSQL `run_fraud_rules()`, acionada após cada ingestão de dados.

---

## Funcionalidades

- **Dashboard** — Métricas em tempo real + gráfico vendas vs. ocupação
- **Central de Alertas** — Histórico, resolução e notificação via WhatsApp
- **Importação CSV** — Upload de extratos PagBank e ST Ingressos
- **Motor de Regras** — R01 e R02 rodando no banco (PostgreSQL)
- **Notificações** — Push nativo do navegador + deep link WhatsApp

---

## Estrutura do Projeto

```
src/
├── lib/
│   └── supabase.ts          # Client Supabase
├── services/
│   ├── dataService.ts       # Acesso ao banco (CRUD + motor de regras)
│   └── notificationService.ts
├── pages/
│   ├── Dashboard.tsx
│   ├── Alerts.tsx
│   ├── Upload.tsx
│   ├── Settings.tsx
│   └── Guide.tsx
├── components/layout/
│   └── Shell.tsx
└── types.ts
supabase/
└── schema.sql               # Tabelas, índices, RLS e funções PL/pgSQL
```

---

## Status

| Componente | Status |
|-----------|--------|
| Interface | Completo |
| Motor de Regras (R01, R02) | Completo |
| Banco de Dados (Supabase) | Completo |
| Importação CSV | Funcional (parser mockado) |
| Integrações Reais (PagBank API, câmeras) | Pendente |
| Autenticação | Pendente |
| Multi-estabelecimento | Pendente |

---

## Roadmap

Consulte [ROADMAP.md](ROADMAP.md) para o planejamento completo de produção.

---

**Sistema Antifraude v1.0 — By RonalDigital**

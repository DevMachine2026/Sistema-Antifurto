# Contexto do projeto — continuidade (Claude Code / qualquer assistente)

Documento único de handoff. Leia antes de alterar auth, RLS, migrations ou multi-tenant. O `README.md` pode estar desatualizado em trechos pontuais; priorize este arquivo + o código.

---

## 1. O que é o produto

**Nome do produto:** Olho Vivo (brand name aplicado nas telas; código interno ainda usa "sistema-antifraude" no repo)

Sistema antifraude para **bares e eventos** (Dev Machine / RonalDigital). Cruza:

- Contagem de pessoas (webhook câmera / Intelbras ISAPI)
- Transações PagBank (CSV / integrações)
- Vendas ST Ingressos (PDF/API)
- Eventos de **espécie no caixa** (`cash_payment_events`, regra **R05** — "cash ghost")

**Motor de regras** no PostgreSQL (`run_fraud_rules()` e triggers), não só no front. Regras: **R01**, **R02**, **R05**.

Não existe login separado para "garçom": o produto monitora operação; dono da casa / plataforma usam o app autenticado.

---

## 2. Stack

| Camada | Tecnologia |
|--------|------------|
| UI | React 19, TypeScript, Vite 6, Tailwind 4, Recharts, motion/react |
| Backend | Supabase (Postgres + Auth + RLS + Edge Functions) |
| Parsers | pdfjs-dist (ST Ingressos), papaparse (PagBank) |
| CI | `.github/workflows/ci.yml` — `npm ci`, `npm run lint` (tsc), `npm run test` |

Porta dev: `npm run dev` → **3000** (`vite --port=3000`).

---

## 3. Estrutura de pastas (resumo)

```
src/
  App.tsx                       # Sessão, RBAC, roteamento (landing/login/register/shell/admin)
  pages/
    Landing.tsx                 # Marketing page — ponto de entrada sem sessão
    Login.tsx                   # Split layout: painel de marca + formulário
    Register.tsx                # Cadastro de comerciante (cria establishment automaticamente)
    SelectEstablishment.tsx     # Seleção de tenant (multi-establishment)
    AdminPanel.tsx              # Gestão de clientes — exclusivo platform_admin
    Dashboard.tsx
    Alerts.tsx
    Upload.tsx
    Settings.tsx
    Guide.tsx
    Simulator.tsx
    Integrations.tsx
    AuditTrail.tsx
  components/layout/
    Shell.tsx                   # Shell do comerciante (sidebar + header responsivo)
    AdminShell.tsx              # Shell do admin da plataforma (header responsivo + drawer mobile)
  lib/
    supabase.ts
    tenant.ts                   # localStorage antifraud.establishment_id + fallback VITE_ESTABLISHMENT_ID
    authInput.ts                # Normalização email/senha + filtros nome/comércio
  services/
    dataService.ts
    notificationService.ts
    auditService.ts
  GUIDE.md                      # Conteúdo operacional exibido no app (Guide.tsx importa como ?raw)
supabase/
  schema.sql
  migration_*.sql
  promote_platform_admin.sql    # Script manual (não é migration automática)
  functions/                    # webhook-camera, webhook-cash, webhook-st-ingressos, send-telegram
```

---

## 4. Fluxo de autenticação e telas

### Estado `authScreen` em App.tsx

```
'landing'  → Landing.tsx     (ponto de entrada — sem sessão)
'login'    → Login.tsx
'register' → Register.tsx
```

Após login com sessão ativa:
- `platform_admin` → `AdminShell` + `AdminPanel` (gestão de clientes). Botão no header acessa o próprio estabelecimento via `Shell` normal.
- `merchant_admin` → `Shell` + Dashboard de monitoramento do próprio estabelecimento.

### RBAC — Modelo

- Tabela `public.profiles`: `user_id` (PK), `role` enum `app_role`: `platform_admin` | `merchant_admin`, `active`.
- Tabela `public.user_establishments`: vínculo usuário ↔ `establishments`, `active`.
- **Platform admin**: acessa `AdminPanel` (lista todos os `establishments`). Para monitorar o próprio bar, usa botão no header do `AdminShell`.
- **Merchant admin**: acessa `Shell` + monitoramento do próprio estabelecimento.

### Funções SQL nas policies (SECURITY DEFINER — crítico)

```sql
current_user_is_platform_admin()   -- SECURITY DEFINER para evitar recursão RLS
user_has_establishment_access(uuid) -- SECURITY DEFINER
```

**Armadilha**: sem `SECURITY DEFINER`, essas funções causam recursão infinita nas policies de `profiles`, resultando em 500.

### Trigger em `auth.users`

- `handle_new_user_profile` (SECURITY DEFINER): cria/atualiza `profiles`.
- `migration_signup_merchant_provision.sql` estende: se existir `establishment_name` no metadata, cria `establishments` + `settings` + `user_establishments` e força `merchant_admin`.

### Super admin (platform_admin)

```sql
UPDATE public.profiles
SET role = 'platform_admin'::public.app_role
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'email@aqui.com');
```

Ou usar `supabase/promote_platform_admin.sql` (substituir placeholder do email nos **dois** lugares).

### Telegram

**Não** armazenar `TELEGRAM_BOT_TOKEN` em `settings` nem no front. Secret na Edge Function `send-telegram`.

---

## 5. Multi-tenant no browser

- `getCurrentEstablishmentId()` / `setCurrentEstablishmentId()` / `clearCurrentEstablishmentId()` em `src/lib/tenant.ts`
- Usa **localStorage** (`antifraud.establishment_id`) + fallback `VITE_ESTABLISHMENT_ID` + UUID demo fixo
- `clearCurrentEstablishmentId()` chamado no logout para evitar contaminação entre sessões
- `loadAccessContext` em App.tsx sempre consulta `user_establishments` para identificar os estabelecimentos **próprios** do usuário (inclusive platform_admin), separado da lista completa de todos os establishments

---

## 6. Integrações via webhook

Todas autenticadas por Bearer token único por estabelecimento (gerenciado na tela Integrações).

| Endpoint | Formato | Descrição |
|----------|---------|-----------|
| `webhook-camera` | Intelbras ISAPI ou genérico JSON | Contagem de pessoas |
| `webhook-cash` | `{camera_id, detected_at, confidence}` | Detecção de espécie no caixa |
| `webhook-st-ingressos` | Array ou objeto com `amount, occurred_at, payment_method` | Vendas bilheteria |

**IDs de câmera padrão:** `cam-area-01`, `cam-area-02` (contagem), `cam-caixa` (espécie).

---

## 7. Migrations SQL — ordem para novo ambiente

1. `schema.sql`
2. `migration_cash_ghost.sql`
3. `migration_webhooks.sql`
4. `migration_rls_production.sql`
5. `migration_idempotency.sql`
6. `migration_audit_events.sql`
7. `migration_remove_telegram_bot_token.sql`
8. `migration_rls_audit_hardening.sql`
9. `migration_rbac_multitenant.sql` — inclui `DROP POLICY IF EXISTS` para reexecução segura
10. `migration_signup_merchant_provision.sql`
11. Opcional: `migration_multi_camera.sql`
12. `rules_integration_tests.sql` — testes com ROLLBACK
13. Opcional: `seed_demo.sql`

**SQL adicional necessário (não está em migration):**

```sql
-- Policy UPDATE para platform_admin poder ativar/desativar establishments:
DROP POLICY IF EXISTS "rbac_establishments_update" ON public.establishments;
CREATE POLICY "rbac_establishments_update"
  ON public.establishments FOR UPDATE TO authenticated
  USING (public.current_user_is_platform_admin())
  WITH CHECK (public.current_user_is_platform_admin());
```

---

## 8. Edge Functions

Deploy:
```bash
npx supabase functions deploy webhook-camera --project-ref SEU_REF
npx supabase functions deploy webhook-cash --project-ref SEU_REF
npx supabase functions deploy webhook-st-ingressos --project-ref SEU_REF
npx supabase functions deploy send-telegram --project-ref SEU_REF
supabase secrets set TELEGRAM_BOT_TOKEN=xxx --project-ref SEU_REF
```

---

## 9. Armadilhas já encontradas

| Problema | Causa / Solução |
|----------|----------------|
| 500 em todas as queries após login | RLS recursão: `current_user_is_platform_admin()` sem `SECURITY DEFINER`. Adicionar SECURITY DEFINER na função. |
| 500 em `user_establishments` com `!inner` | PostgREST inner join com RLS complexo. Solução: duas queries separadas em App.tsx. |
| `policy "rbac_*" already exists` | Reexecutar RBAC sem drop — corrigido no arquivo com drops explícitos. |
| `current_establishment_id() does not exist` | Ordem de execução das migrations. |
| Email não confirmado → 400 no login | Desabilitar "Confirm email" em Supabase Auth Settings OU rodar `UPDATE auth.users SET email_confirmed_at = now()`. |
| Cross-session contamination (wrong establishment) | localStorage persiste entre logins. Solução: `clearCurrentEstablishmentId()` no logout. |
| Platform admin cai no establishment errado | `loadAccessContext` agora usa `user_establishments` para detectar estabelecimentos próprios e chama `setCurrentEstablishmentId` com o próprio. |
| Cadastro não cria comércio | `migration_signup_merchant_provision.sql` não aplicada ou signup sem `establishment_name` no metadata. |
| `promote_platform_admin.sql` quebrado | Aspas do email não fechadas ao editar — validar sintaxe antes de rodar. |

---

## 10. Diretrizes para o assistente

- Mudanças **mínimas** e focadas no pedido; não refatorar arquivos inteiros "de brinde".
- Auth/RLS: qualquer alteração em policy ou trigger pode bloquear produção; sempre considerar idempotência.
- **Nunca** commitar credenciais, tokens, service role key ou senhas reais.
- Respostas objetivas; evitar repetição e parágrafos longos.
- Nome do produto nas telas: **Olho Vivo**. Nome do repo/código: sistema-antifraude.

---

## 11. Documentação irmã

- `CHECKLIST_PRODUCAO.md` — go-live
- `RUNBOOK_INCIDENTES.md` — incidentes
- `src/GUIDE.md` — uso operacional (exibido no app)
- `README.md` — instalação, webhooks, estrutura geral

---

*Última cobertura: brand "Olho Vivo", Landing page, AdminPanel/AdminShell, RBAC com platform_admin isolado, botões mobile (Sair/Voltar), cross-session isolation, política UPDATE establishments.*

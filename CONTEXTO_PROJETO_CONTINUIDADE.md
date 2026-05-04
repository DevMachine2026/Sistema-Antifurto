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

**Notificações após regras (atualizado):**
As Edge Functions `webhook-camera`, `webhook-cash` e `webhook-st-ingressos` chamam `run_fraud_rules` e, quando há linhas retornadas, disparam `send-telegram` / `send-whatsapp` via `notify.ts` **dentro da pasta de cada função** (o deploy pelo **dashboard** do Supabase não inclui `../_shared`; manter as três cópias de `notify.ts` alinhadas ao alterar a lógica).
Importação de CSV pelo app ainda roda `run_fraud_rules` no cliente e dispara `notificationService.sendAlert` (Edge Functions com sessão do usuário).

**WhatsApp (API no servidor):**
Existe Edge Function `send-whatsapp` (Evolution/Z-API compatível via `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN`). O cliente escolhe Telegram, WhatsApp ou ambos em Configurações.

---

## 8.1. Infraestrutura de Streaming (câmeras ao vivo)

Adicionada em mai/2026. Usada para exibir vídeo ao vivo das câmeras no frontend.

**Stack de streaming:**

| Componente | Função |
|---|---|
| `mediamtx` (binário `/mediamtx`) | Servidor RTSP→HLS. Porta RTSP: 8554, HLS: 8888, API: 9997 |
| `ffmpeg` | Captura webcam (`/dev/video0`) e publica em RTSP. Usado para testes locais. |
| `server/` (Node.js/Express) | Backend local. Porta 3456. Registra câmeras no MediaMTX e serve URLs HLS ao frontend. |
| `docker-compose.yml` | Orquestração para deploy no Raspberry Pi (mediamtx + backend) |

**Fluxo de vídeo:**
```
Câmera IP (RTSP) ou webcam+ffmpeg
  → MediaMTX (RTSP :8554)
    → HLS (http://HOST:8888/CAMERA_ID/index.m3u8)
      → CameraPlayer.tsx (hls.js)
        → exibe no browser com badge "AO VIVO"
```

**Variáveis de ambiente críticas do backend (`server/.env`):**

```env
MEDIAMTX_API=http://127.0.0.1:9997        # API interna do MediaMTX (não exposta ao browser)
MEDIAMTX_HLS_URL=http://IP_DO_PI:8888     # URL que o BROWSER usa para acessar HLS — deve ser o IP real do Pi
PORT=3456
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
FRONTEND_URL=https://sistema-antifurto.vercel.app
```

**Bug corrigido — cookie check do MediaMTX:**
MediaMTX faz redirect 302 com `Set-Cookie: cookieCheck=1` antes de servir o HLS.
`hls.js` sem credenciais nunca envia o cookie de volta → loop de redirect → stream não carrega.
Correção em `src/components/CameraPlayer.tsx`:
```js
const hls = new Hls({
  enableWorker: false,
  xhrSetup: (xhr) => { xhr.withCredentials = true; },
});
```

**CORS em produção (`server/mediamtx.yml`):**
Com `withCredentials: true`, o browser exige `Access-Control-Allow-Origin` específico (não `*`).
O `mediamtx.yml` já tem configurado:
```yaml
hlsAllowOrigins:
  - https://sistema-antifurto.vercel.app
  - http://localhost:3000
  - http://localhost:5173
```
Se adicionar outros domínios (staging, preview Vercel), incluir aqui e reiniciar o Docker no Pi.

**Como a contagem de pessoas funciona:**
O sistema **não faz visão computacional** — delega para o firmware da câmera.
Câmeras Intelbras/Hikvision/Dahua com "People Counting" ativo usam linha de cruzamento:
- Pessoa entra → `count_in + 1`
- Pessoa sai → `count_out + 1`
- `people_inside = count_in - count_out`
A câmera envia os valores via webhook (formato Intelbras ISAPI ou JSON genérico).
Deduplicação por `external_event_key` (hash SHA-256 do payload) previne dupla contagem por falha de rede.
A webcam de teste **não tem esse firmware** — só exibe vídeo.

**Teste local com webcam:**
```bash
# Iniciar MediaMTX nativo
/mediamtx &

# Capturar webcam e publicar no MediaMTX
ffmpeg -f v4l2 -i /dev/video0 -vf format=yuv420p \
  -vcodec libx264 -preset ultrafast -tune zerolatency \
  -rtsp_transport tcp -f rtsp rtsp://localhost:8554/teste

# Iniciar backend
cd server && npx ts-node-dev --respawn --transpile-only index.ts

# Frontend
npm run dev
```
A câmera deve estar cadastrada no Supabase com `camera_id='teste'` e `status='online'`.

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
| Stream HLS não carrega no browser | MediaMTX faz cookie check (302 redirect). `hls.js` sem `withCredentials` nunca envia o cookie. Corrigido com `xhrSetup: (xhr) => { xhr.withCredentials = true }` em `CameraPlayer.tsx`. |
| CORS bloqueado em produção com HLS | `withCredentials: true` exige origem específica no CORS. Configurar `hlsAllowOrigins` no `mediamtx.yml` com o domínio exato do Vercel. |
| `MEDIAMTX_API_URL` não lida em `streams.ts` | O `.env` usa `MEDIAMTX_API` mas `streams.ts` lia `MEDIAMTX_API_URL`. Corrigido para aceitar ambos. |
| Câmera mostra "offline" mesmo com stream ativo | `CameraPlayer` exige `status === 'online'` para tentar carregar o HLS. Câmera deve estar cadastrada no Supabase com esse status. |

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

---

## 12. Estado atual e o que falta (mai/2026)

### Pronto e funcionando
- Streaming ao vivo de câmeras (MediaMTX + hls.js) com badge "AO VIVO" ✅
- Motor de regras R01/R02/R05 no Postgres ✅
- Webhooks autenticados por tenant (câmera, caixa, ST Ingressos) ✅
- RLS por tenant via JWT claim `establishment_id` — dados não se misturam ✅
- Frontend Vercel + backend local (Raspberry Pi) com CORS configurado ✅
- Wizard de cadastro de câmeras ✅
- Multi-tenant, RBAC, platform_admin ✅
- Tela **Prontidão** (`Readiness.tsx`) — checklist guiado no app ✅

### Falta implementar (por prioridade)

**P0 — Bloqueia uso real em produção:**

1. ~~Disparo automático pós-regra~~ — webhooks de ingestão disparam notificações via `notify.ts` em cada pasta da função; import CSV usa `notificationService` no browser (considerar mover 100% para servidor com fila/pg_net se quiser zero dependência de sessão aberta).

2. ~~`send-whatsapp`~~ — implementada; validar secrets `WHATSAPP_*` em cada projeto Supabase.

3. **Passo manual no deploy do Pi** — editar `MEDIAMTX_HLS_URL=http://IP_DO_PI:8888` no `.env` do servidor com o IP real da máquina. O browser do Vercel precisa alcançar esse IP (mesma rede local do cliente ou túnel).

**P1 — Recomendado antes de escalar:**

4. Ambientes separados dev/staging/prod (Supabase project separado para staging)
5. Alerting operacional — definir quem recebe alerta quando o sistema cai (não confundir com notificação de fraude)
6. Teste E2E do fluxo completo: câmera → contagem → regra → alerta → notificação

### Primeiro cliente de produção
Restaurante em Fortaleza, mesmo dono do Ice Bar.
Fluxo crítico para esse cliente: câmera conta pessoas na entrada → caixa registra vendas → motor detecta anomalia → **dono recebe mensagem** (WhatsApp ou Telegram).
O item que ainda exige atenção operacional para esse cliente é principalmente rede/HLS no Pi (item 3) e validação E2E dos canais em produção.

---

*Última cobertura: streaming HLS ao vivo com MediaMTX, cookie fix hls.js, hlsAllowOrigins produção, lacuna de notificações automáticas identificada, arquitetura de contagem de pessoas documentada, primeiro cliente restaurante Fortaleza.*

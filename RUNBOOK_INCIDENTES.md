# Runbook de Incidentes — Olho Vivo

## Classificação

- **P1 Crítico:** perda de ingestão, alerta não dispara, agente offline em todos os estabelecimentos
- **P2 Alto:** degradação parcial, atraso de notificação, agente offline em um estabelecimento
- **P3 Médio:** problema pontual sem impacto amplo

---

## Primeiros 15 minutos

1. Registrar horário de início e responsável
2. Identificar componente afetado:
   - **Agente** (`agent-config`, `agent-heartbeat`, `agent-cameras-found`)
   - **Ingestão** (`webhook-camera`, `webhook-cash`, `webhook-st-ingressos`)
   - **Notificações** (`send-telegram`, `send-whatsapp`)
   - **Frontend** (Vercel)
3. Coletar evidências: logs JSON da function (`request_id`, `event`, `function_name`), erro retornado, período e tenant afetado
4. Comunicar status inicial

---

## Diagnóstico por Componente

### Agente aparece Offline

O merchant verifica o status em **Menu → Agentes**. O platform_admin vê todos os agentes no **Painel Administrativo → lista de estabelecimentos**.

1. Verificar se o PC está ligado e com internet
2. Verificar se o processo do agente está rodando:
   - **Windows:** pode aparecer como `OlhoVivo_TOKEN_*.exe` no Gerenciador de Tarefas
   - **Linux:** `systemctl --user status olhovivo-agent`
   - **macOS:** `launchctl list | grep olhovivo`
3. **Token / autenticação do agente**
   - **Windows (instalador):** token e chaves em `%LOCALAPPDATA%\OlhoVivoAgent\.olhovivo.env` (inclui `SUPABASE_URL` após atualização do agente). Se o cliente renomeou o `.exe`, peça novo download pelo link do painel.
   - Log `SUPABASE_URL não definida` → adicionar linha `SUPABASE_URL=https://SEU_REF.supabase.co` no `.olhovivo.env` e reiniciar o agente.
   - **Linux (instalador):** token em `~/.local/share/OlhoVivoAgent/.olhovivo.env`
   - **macOS (instalador):** token em `~/Library/Application Support/OlhoVivoAgent/.olhovivo.env`
   - **Dev:** conferir `ESTABLISHMENT_TOKEN` no ambiente; copiar da aba **Agentes** se necessário.
4. Verificar `agente.log` na pasta de dados do SO:
   - Windows: `%LOCALAPPDATA%\OlhoVivoAgent\agente.log`
   - Linux: `~/.local/share/OlhoVivoAgent/agente.log`
   - macOS: `~/Library/Application Support/OlhoVivoAgent/agente.log`
5. Confirmar JWT desativado em `agent-config`, `agent-heartbeat`, `agent-cameras-found` (Supabase → Edge Functions → Settings)

### Câmeras não contam pessoas

1. Agente está Online? (se não, ver seção acima)
2. Câmera aparece na aba **Câmeras** do painel?
   - Se não: aguardar 2–3 min após agente Online (ONVIF scan automático)
   - Se ainda não: câmera pode não ter ONVIF — usar **Câmeras → Adicionar manualmente** com o IP do app do fabricante
3. Câmera acessível via RTSP? Testar: `ffprobe rtsp://admin:SENHA@IP:554/stream1`
4. Verificar logs do agente: `cap.read() failed` indica câmera desconectada
5. Câmera na mesma rede que o PC? Reiniciar câmera e aguardar re-descoberta automática

### Alerta R01/R02 não dispara

1. Dados de câmera chegando? Verificar `people_count_events` no Supabase
2. Dados de vendas chegando? Verificar `transactions` no Supabase
3. Confirmar threshold configurado em Configurações (R01: pessoas e janela de tempo; R02: gap financeiro)
4. Janela de monitoramento inclui o horário atual?
5. Executar `run_fraud_rules()` manualmente no SQL Editor para testar

### Telegram não recebe notificações

1. `TELEGRAM_BOT_TOKEN` presente em Supabase Secrets? (configurado uma vez por deploy via Painel Admin)
2. Merchant passou pelo fluxo **Configurações → Conectar Telegram** e clicou em **Iniciar** no bot `@sistemantifraude_bot`? (sem esse passo, o `telegram_chat_id` não é registrado)
3. Testar envio via **Configurações → Testar notificação**
4. Verificar logs da `send-telegram` no Supabase

### Banco / RLS

```sql
-- Verificar alertas e backlog:
-- supabase/observability_queries.sql

-- Verificar policies:
-- supabase/rls_validation_check.sql
```

---

## Backups e disaster recovery (produção)

1. **Supabase Dashboard → Database → Backups**
   - Plano **Pro+**: ativar **Point-in-Time Recovery (PITR)**.
   - Anotar RPO/RTO aceitável (ex.: RPO 24h, RTO 4h).
2. **Teste de restore trimestral**
   - Restaurar snapshot em projeto de staging; validar login, uma loja e um agente.
3. **Storage `evidence`**
   - Retenção: migration `migration_retention.sql` (purge DB via `olhovivo_purge_old_events`) + Edge Function `evidence-purge` (cron `olhovivo_evidence_purge`).
   - Deploy: `supabase functions deploy evidence-purge --no-verify-jwt` (senão o gateway exige `Authorization` e o cron falha).
   - Secret `CRON_SECRET` + header `x-cron-secret` no job Cron (Integrations → Cron → SQL Snippet com `net.http_post`).
   - Teste: `curl -X POST "https://SEU_REF.supabase.co/functions/v1/evidence-purge?est_per_run=5" -H "x-cron-secret: VALOR_DO_SECRET"`.
4. **Secrets**
   - Exportar lista de nomes (não valores) dos Secrets das Edge Functions para runbook offline.

---

## Contenção e Mitigação

**Agente offline:**
- Sistema continua operando; ingestão via webhooks diretos ainda funciona
- Importar CSV PagBank e PDF ST Ingressos manualmente enquanto resolve

**Telegram com falha:**
- Usar WhatsApp como canal alternativo
- Corrigir secret/configuração e retestar envio

**Ingestão com payload inválido:**
- Pausar origem com erro
- Corrigir validação/formato
- Reprocessar lote quando correto

---

## Encerramento

1. Confirmar normalização por mínimo 30 minutos
2. Registrar causa raiz e ação corretiva permanente
3. Atualizar este runbook se surgir nova lacuna

---

*Atualizado mai/2026 — suporte Windows + Linux + macOS*

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
3. Coletar evidências: logs da function com `request_id`, erro retornado, período e tenant afetado
4. Comunicar status inicial

---

## Diagnóstico por Componente

### Agente aparece Offline no AdminPanel

1. Verificar se o PC do restaurante está ligado e com internet
2. Verificar se o processo do agente está rodando (no Windows empacotado pode aparecer como `OlhoVivo_TOKEN_*.exe` ou similar)
3. **Token / autenticação do agente**
   - **Windows (instalador):** o token vem do nome do instalador (`OlhoVivoSetup_TOKEN_...exe`) e fica em `%LOCALAPPDATA%\OlhoVivoAgent\.olhovivo.env`. Se o cliente renomeou o instalador ou usou só `OlhoVivoSetup.exe` do Release sem `TOKEN_`, peça novo download pelo link do painel (ou reinstalar com `/TOKEN=` em cenário técnico).
   - **Dev / Linux:** conferir `ESTABLISHMENT_TOKEN` ou `token.txt` na pasta do agente; copiar de novo do AdminPanel → Agentes se necessário.
4. Verificar `agente.log` em `%LOCALAPPDATA%\OlhoVivoAgent\` (Windows empacotado) — erros de conexão com Supabase?
5. Confirmar JWT desativado em `agent-config`, `agent-heartbeat`, `agent-cameras-found` (Supabase → Edge Functions → Settings)

### Câmeras não contam pessoas

1. Agente está Online? (se não, ver seção acima)
2. Câmera aprovada no AdminPanel → Agentes?
3. Câmera acessível via RTSP? Testar: `ffprobe rtsp://admin:SENHA@IP:554/stream1`
4. Verificar logs do agente: `cap.read() failed` indica câmera desconectada
5. Câmera na mesma rede que o PC? Reiniciar câmera e aguardar re-descoberta

### Alerta R01/R02 não dispara

1. Dados de câmera chegando? Verificar `people_count_events` no Supabase
2. Dados de vendas chegando? Verificar `transactions` no Supabase
3. Confirmar threshold configurado em Configurações (R01: pessoas e janela de tempo; R02: gap financeiro)
4. Janela de monitoramento inclui o horário atual?
5. Executar `run_fraud_rules()` manualmente no SQL Editor para testar

### Telegram não recebe notificações

1. `TELEGRAM_BOT_TOKEN` presente em Supabase Secrets?
2. `telegram_chat_id` configurado corretamente em Configurações → Salvar?
3. Testar via Configurações → "Testar notificação"
4. Verificar logs da `send-telegram` no Supabase

### Banco / RLS

```sql
-- Verificar alertas e backlog:
-- supabase/observability_queries.sql

-- Verificar policies:
-- supabase/rls_validation_check.sql
```

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

*Atualizado mai/2026*

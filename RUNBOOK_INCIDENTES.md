# Runbook de Incidentes

Guia rapido para resposta operacional em producao.

## 1) Classificacao

- P1 Critico: perda de ingestao, alerta nao dispara, erro em massa
- P2 Alto: degradacao parcial, atraso de notificacao
- P3 Medio: problema pontual sem impacto amplo

## 2) Primeiros 15 minutos

1. Registrar horario de inicio e responsavel.
2. Identificar integracao afetada:
   - `webhook-camera`
   - `webhook-cash`
   - `webhook-st-ingressos`
   - `send-telegram`
3. Coletar evidencias:
   - logs da function com `request_id`
   - erro retornado ao cliente
   - periodo e tenant afetado
4. Comunicar status inicial ao time.

## 3) Diagnostico tecnico

### Banco e regras

- Verificar alertas abertos e backlog com `supabase/observability_queries.sql`
- Confirmar RLS e policies ativas com `supabase/rls_validation_check.sql`

### Secrets e configuracao

- Verificar secrets no Supabase:
  - `TELEGRAM_BOT_TOKEN`
- Verificar `settings.telegram_chat_id` do tenant impactado

### Integracoes

- Validar token de webhook (`settings.webhook_token`)
- Confirmar formato de payload recebido
- Confirmar deduplicacao por `external_event_key`

## 4) Contencao e mitigacao

- Se problema for Telegram:
  - manter sistema rodando com push/WhatsApp
  - corrigir secret/configuracao e retestar envio
- Se problema for ingestao:
  - pausar origem com payload invalido
  - corrigir validacao/formato
  - reprocessar lote quando necessario

## 5) Encerramento

1. Confirmar normalizacao por no minimo 30 minutos.
2. Registrar causa raiz e acao corretiva permanente.
3. Atualizar checklist de producao se surgir nova lacuna.

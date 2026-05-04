# Checklist de Producao - Sistema Antifraude

Checklist operacional atualizado para decisao de go-live.

## P0 - Bloqueia Producao

- [x] Segredo Telegram fora do frontend (`TELEGRAM_BOT_TOKEN` em Supabase Secrets)
- [x] Teste de notificacao Telegram validado no app (Configuracoes -> Testar) em 04/05/2026
- [x] Coluna sensivel removida do banco (`settings.telegram_bot_token`)
- [x] RLS por tenant ativo nas tabelas de dominio
- [x] Hardening de RLS em `audit_events`
- [x] CI minimo no repositorio (`.github/workflows/ci.yml`)
- [ ] Canal WhatsApp em producao (definir provedor + configurar `WHATSAPP_API_URL` e `WHATSAPP_API_TOKEN`)
- [ ] Ambientes separados validados (dev/staging/prod)
- [ ] Backup/restore testado com evidencias
- [ ] Alerting operacional definido (quem recebe, qual canal, SLA)

## P1 - Recomendado antes de escalar

- [ ] Teste E2E do fluxo critico (ingestao -> regra -> alerta -> resolucao)
- [ ] Runbook de incidente validado por pelo menos 1 simulacao
- [ ] Documentacao de deploy/rollback revisada por 2 pessoas
- [ ] Monitoramento de volume/erro por integracao em rotina diaria

## Validacoes Tecnicas Rapidas

### Banco / RLS

Executar:

- `supabase/migration_rls_production.sql`
- `supabase/migration_rls_audit_hardening.sql`
- `supabase/rls_validation_check.sql`

Criterio de aceite:

- Query de policies permissivas retorna 0 linhas
- Apenas policies `tenant_*` nas tabelas sensiveis do escopo

### Aplicacao

Executar:

- `npm run lint`
- `npm run test`

Criterio de aceite:

- Typecheck sem erros
- Suite de testes passando

## Operacao e Observabilidade

- Queries de apoio: `supabase/observability_queries.sql`
- Logs de Edge Functions: usar `request_id` para correlacao de falhas
- Priorizar revisao diaria de:
  - alertas criticos abertos
  - cash events sem match
  - eventos de erro no `audit_events`

## Gate de Go-Live (objetivo)

Pode promover para producao quando:

1. Todos os itens P0 estiverem concluidos.
2. Staging rodar por 1 ciclo operacional sem incidente critico.
3. Responsaveis de negocio e tecnico aprovarem rollback plan.

## Evidencias recentes (implantacao)

- 04/05/2026: deploy de Edge Functions atualizado (webhooks + send-telegram/send-whatsapp).
- 04/05/2026: teste de Telegram pelo frontend retornando sucesso ("Mensagem enviada no Telegram!").
- 04/05/2026: streaming local validado com MediaMTX + `ffmpeg` (webcam e modo `USE_TESTSRC=1`).

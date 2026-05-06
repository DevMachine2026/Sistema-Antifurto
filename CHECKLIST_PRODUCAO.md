# Checklist de Produção — Olho Vivo

## P0 — Bloqueia Produção

- [x] `TELEGRAM_BOT_TOKEN` em Supabase Secrets (fora do frontend)
- [x] Notificação Telegram testada via app (Configurações → Testar) — mai/2026
- [x] Coluna `settings.telegram_bot_token` removida do banco
- [x] RLS por tenant ativo em todas as tabelas de domínio
- [x] Hardening de RLS em `audit_events`
- [x] CI no repositório (`.github/workflows/ci.yml`)
- [x] Edge Functions agent-* com JWT desativado (usam token próprio)
- [x] Agente Olho Vivo testado com câmera real (mai/2026)
- [x] Build automático `.exe` via GitHub Actions (`build-agent.yml`)
- [ ] Canal WhatsApp em produção (definir provedor + `WHATSAPP_API_URL` e `WHATSAPP_API_TOKEN`)
- [ ] Backup/restore testado com evidências
- [ ] Alerting operacional definido (quem recebe, qual canal, SLA)

## P1 — Recomendado antes de escalar

- [ ] Teste E2E do fluxo crítico: agente → ingestão → regra → alerta → Telegram
- [ ] Runbook de incidente validado por pelo menos 1 simulação
- [ ] Monitoramento de volume/erro por integração em rotina diária
- [ ] Segundo restaurante implantado (validar fluxo de escala: token → agente → câmera)

## Validações Técnicas Rápidas

### Banco / RLS
```sql
-- Executar no SQL Editor:
-- supabase/migration_rls_production.sql
-- supabase/migration_rls_audit_hardening.sql
-- supabase/migration_agent.sql
```
Critério: zero policies permissivas nas tabelas sensíveis.

### Frontend
```bash
npm run lint    # tsc sem erros
npm run test    # suite passando
```

### Agente (no PC do restaurante)
```
- Aparece Online no AdminPanel → Agentes
- Câmera descoberta e aprovada
- Logs mostram ENTROU/SAIU ao cruzar a linha
- Alerta R01 dispara após janela sem vendas
```

## Observabilidade

- Queries de apoio: `supabase/observability_queries.sql`
- Logs de Edge Functions: usar `request_id` para correlação de falhas
- Revisar diariamente: alertas críticos abertos, eventos de erro no `audit_events`

## Edge Functions (todas deployadas)

| Função | JWT | Propósito |
|---|---|---|
| `webhook-camera` | ON | Recebe eventos de contagem do agente |
| `webhook-cash` | ON | Recebe detecção de espécie |
| `webhook-st-ingressos` | ON | Recebe vendas ST Ingressos |
| `agent-config` | **OFF** | Serve config ao agente (token próprio) |
| `agent-heartbeat` | **OFF** | Recebe heartbeat do agente |
| `agent-cameras-found` | **OFF** | Recebe câmeras descobertas via ONVIF |
| `send-telegram` | ON | Dispara notificações Telegram |
| `send-whatsapp` | ON | Dispara notificações WhatsApp |

## Gate de Go-Live

Promover para produção quando:
1. Todos os itens P0 concluídos
2. Pelo menos 1 restaurante rodando sem incidente crítico por 1 semana
3. Responsáveis de negócio e técnico aprovaram plano de rollback

---

*Atualizado mai/2026*

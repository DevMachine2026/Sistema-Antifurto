# Arquitetura IA — Olho Vivo (Gemini)

## Visão

A IA atua como **analista antifraude**, não chatbot. Toda inferência roda na Edge Function `ai-analyze`; o front só exibe JSON estruturado.

```
[Dashboard / Alertas / Resumo]
        │ invoke (JWT usuário)
        ▼
[ai-analyze] ──► cache ai_analyses
        │ miss
        ▼
[buildMetricsSnapshot] ──► [Gemini 2.0 Flash] ou [rules fallback]
```

## Tipos de análise

| `analysis_type` | UI | Cache (`period_key`) | TTL |
|-------------------|-----|----------------------|-----|
| `dashboard` | Card no Dashboard | `dash:YYYY-MM-DDTHH` | 1 h |
| `executive` / `shift_summary` | Resumo inteligente | `shift:YYYY-MM-DD` | 6 h |
| `alert_investigation` | Card no alerta | `alert:{uuid}` | 12 h |
| `business_insights` | (futuro) | `biz:YYYY-MM-DD` | 6 h |

## Score de risco

Calculado deterministicamente em `aiContextBuilder.ts` e refinado pelo Gemini:

- **low** (0–24): operação estável  
- **medium** (25–49): pontos de atenção  
- **high** (50–74): investigar no turno  
- **critical** (75+): ação imediata  

Fatores: alertas high abertos, cash ghost, crowd sem venda, gap financeiro, pico sem conversão.

## Economia

- Cache por `establishment_id + analysis_type + period_key`
- Limite diário: `AI_DAILY_LIMIT_PER_EST` (default 40)
- Rate limit HTTP: 15 req/min por IP (`checkRateLimit`)
- Snapshot compacto (sem imagens no prompt)
- Fallback **rules** se `GEMINI_API_KEY` ausente ou Gemini falhar

## Segurança

- `GEMINI_API_KEY` só em Secrets Supabase
- JWT obrigatório + `user_has_establishment_access`
- RLS em `ai_analyses`
- Nenhuma PII desnecessária no prompt (operador como id opcional)

## Deploy

```bash
# SQL
# migration_ai_insights.sql

supabase secrets set GEMINI_API_KEY=sua_chave --project-ref SEU_REF
supabase functions deploy ai-analyze --project-ref SEU_REF
```

Chave gratuita: [Google AI Studio](https://aistudio.google.com/apikey)

## Melhorias futuras

- Embeddings para comparar turnos semanais
- Relatório PDF/WhatsApp do resumo do turno
- Score por operador persistente (`operator_risk_scores`)
- Trigger pós-alerta para pré-gerar investigação

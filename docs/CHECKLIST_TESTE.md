# Checklist de testes — Olho Vivo

Ordem **crescente** (do mais simples ao mais completo). Use com outro testador (ex.: programador).

**Ambiente sugerido:** produção `https://sistema-antifurto.vercel.app` + Supabase do projeto.

**Estabelecimento:** preferir tenant de **teste**; evitar dados reais de cliente em simulações destrutivas.

---

## Fase 0 — Preparação (~15 min)

| # | Teste | Quem | O que fazer | Resultado esperado |
|---|--------|------|-------------|-------------------|
| 0.1 | Acessos | Você | Login no painel; conta para o segundo testador | Ambos entram sem erro |
| 0.2 | Estabelecimento | Você | Selecionar o mesmo bar (ex.: Ice Bar) | Nome correto no topo |
| 0.3 | Papéis | Programador | Supabase → `profiles` (`platform_admin` vs `merchant_admin`) | Saber se veem Admin / Simulador |
| 0.4 | Modo navegação | Você | **Modo Operação** ↔ **Mais opções (Avançado)** | Operação: sem Agentes/Simulador; Avançado: aparecem |
| 0.5 | Ferramentas | Programador | DevTools → **Network** + **Console** | Sem erros vermelhos críticos ao abrir Dashboard |

- [ ] 0.1
- [ ] 0.2
- [ ] 0.3
- [ ] 0.4
- [ ] 0.5

---

## Fase 1 — Smoke test do painel (~20 min)

| # | Teste | O que fazer | Resultado esperado |
|---|--------|-------------|-------------------|
| 1.1 | Dashboard | Menu → **Dashboard** | Métricas, gráfico, Saúde; sem tela branca longa |
| 1.2 | Saúde | Ler card Saúde do sistema | Telegram, agente, pessoas, alertas legíveis |
| 1.3 | Analista IA | Card **Analista antifraude** | Headline + insights + badge de risco (ou erro claro) |
| 1.4 | Resumo inteligente | Menu → **Resumo inteligente** | Resumo executivo, eventos, insights |
| 1.5 | Alertas | Menu → **Alertas de fraude** | Lista abre (pode estar vazia) |
| 1.6 | Implantação | Menu → **Implantação** | 3 passos; **sem piscar tela preta** ~15 s |
| 1.7 | Prontidão | Menu → **Prontidão** | Checklist ok/pendente |
| 1.8 | Guia | Menu → **Guia** | Manual renderizado |
| 1.9 | i18n | PT ↔ EN no header | Labels mudam |

**Falha comum (1.3):** Network → `ai-analyze` 401/500 → conferir `GEMINI_API_KEY` e deploy da function.

- [ ] 1.1
- [ ] 1.2
- [ ] 1.3
- [ ] 1.4
- [ ] 1.5
- [ ] 1.6
- [ ] 1.7
- [ ] 1.8
- [ ] 1.9

---

## Fase 2 — IA Gemini (~20 min) — programador lidera

| # | Teste | O que fazer | Resultado esperado |
|---|--------|-------------|-------------------|
| 2.1 | API | Network → POST `ai-analyze` | HTTP **200**, `ok: true`, `risk_level`, `result` |
| 2.2 | Cache | Abrir Dashboard 2× sem Atualizar | 2ª mais rápida; hint de cache opcional |
| 2.3 | Refresh | Atualizar no card IA e no Resumo | Nova chamada; texto pode mudar |
| 2.4 | Banco | Supabase → `ai_analyses` | Linhas `dashboard` / `executive` do tenant |
| 2.5 | Alerta | Alerta aberto → parecer IA | Hipótese + passos (se houver alerta) |
| 2.6 | Fallback | (Opcional) ambiente sem Gemini | Texto genérico; logs `rules` |

- [ ] 2.1
- [ ] 2.2
- [ ] 2.3
- [ ] 2.4
- [ ] 2.5
- [ ] 2.6

---

## Fase 3 — Simulador (~30 min) — **Modo Avançado**

| # | Teste | O que fazer | Resultado esperado |
|---|--------|-------------|-------------------|
| 3.1 | Reset | Simulador → limpar demo | Dados de teste apagados; log ok |
| 3.2 | ST | Simular ST Ingressos | Transações ST no Dashboard |
| 3.3 | PagBank | Simular PagBank | Gap se valores divergirem |
| 3.4 | Pessoas | Simular contagem (ex.: 85) | Salão / gráfico atualizam |
| 3.5 | Regras | Disparar motor de regras | Alertas R01/R02/R05 em **Alertas** |
| 3.6 | Telegram | (Opcional) bot configurado | Mensagem no celular |
| 3.7 | Dashboard | Voltar ao Dashboard | Métricas coerentes com simulação |
| 3.8 | IA | Resumo inteligente → Atualizar | Texto cita alertas simulados |

- [ ] 3.1
- [ ] 3.2
- [ ] 3.3
- [ ] 3.4
- [ ] 3.5
- [ ] 3.6
- [ ] 3.7
- [ ] 3.8

### Regras — referência

| Regra | Como forçar | Esperado |
|-------|----------------|----------|
| **R01** | Muitas pessoas, poucas vendas | Salão cheio sem vendas |
| **R02** | PagBank ≠ ST | Gap financeiro |
| **R05** | Passo cash ghost no simulador | Espécie sem lançamento |

---

## Fase 4 — Alertas e POS × Vídeo (~15 min)

| # | Teste | O que fazer | Resultado esperado |
|---|--------|-------------|-------------------|
| 4.1 | Resolver | Marcar alerta resolvido + nota | Sai dos abertos; auditoria ok |
| 4.2 | POS × Vídeo | Menu → **POS × Vídeo** | Timeline; estados sincronizado / sem evidência / caixa sem venda |

- [ ] 4.1
- [ ] 4.2

---

## Fase 5 — Implantação + agente (~45–90 min)

| # | Teste | O que fazer | Resultado esperado |
|---|--------|-------------|-------------------|
| 5.1 | Telegram | Link → Iniciar no bot | Passo 1 concluído |
| 5.2 | Download | Windows / Linux / macOS | Arquivo baixa |
| 5.3 | Instalar | PC de teste | Passo 2 **Agente Online** em ~10 min |
| 5.4 | Heartbeat | `agent_heartbeats` | `reported_at` < 10 min |
| 5.5 | Contagem | Pessoa na linha da câmera | Evento + foto no feed |
| 5.6 | Câmera | Aprovar candidato ONVIF | Implantação 3/3 |
| 5.7 | Prontidão | Aba Prontidão | Maioria verde |

- [ ] 5.1
- [ ] 5.2
- [ ] 5.3
- [ ] 5.4
- [ ] 5.5
- [ ] 5.6
- [ ] 5.7

---

## Fase 6 — Importações (~20 min)

| # | Teste | O que fazer | Resultado esperado |
|---|--------|-------------|-------------------|
| 6.1 | PDF ST | Importar PDF bilheteria | Lote + transações ST |
| 6.2 | CSV PagBank | Importar CSV | Transações PagBank; gap atualiza |
| 6.3 | Integrações | Ver webhooks/token | URLs copiáveis |

- [ ] 6.1
- [ ] 6.2
- [ ] 6.3

---

## Fase 7 — Segurança (~20 min) — programador

| # | Teste | O que fazer | Resultado esperado |
|---|--------|-------------|-------------------|
| 7.1 | RLS | Acesso a outro tenant via API | Bloqueado |
| 7.2 | JWT | `ai-analyze` sem Authorization | 401 |
| 7.3 | Secrets | Bundle do front | Sem `GEMINI_API_KEY` |
| 7.4 | LGPD | Configurações → export JSON | Só dados do tenant |
| 7.5 | Sessão | Logout / login | Estabelecimento correto |

- [ ] 7.1
- [ ] 7.2
- [ ] 7.3
- [ ] 7.4
- [ ] 7.5

---

## Fase 8 — Regressão UX (~10 min)

| # | Teste | Resultado esperado |
|---|--------|-------------------|
| 8.1 | Implantação aberta 5 min | Sem flash preto |
| 8.2 | Largura mobile | Menu e cards legíveis |
| 8.3 | Link Resumo no Dashboard | Navega para Resumo inteligente |

- [ ] 8.1
- [ ] 8.2
- [ ] 8.3

---

## Roteiro do dia (~4 h)

| Bloco | Fases | Tempo |
|-------|-------|-------|
| Manhã 1 | 0 + 1 + 2 | ~55 min |
| Manhã 2 | 3 + 4 | ~45 min |
| Tarde | 5 (opcional) + 6 + 7 + 8 | ~2 h |

---

## Critério “pronto para demo ao contratante”

- Fases **1**, **3** e **4** OK no tenant de teste
- IA: **2.1–2.4** OK
- Implantação: **8.1** OK

---

## Registro de bugs

| # | Tela | Passos | Esperado | Obtido | Sev. |
|---|------|--------|----------|--------|------|
| 1 | | | | | P0/P1/P2 |
| 2 | | | | | |

---

## Fora de escopo deste checklist

- Relatório automático de turno (WhatsApp/email)
- Score histórico por operador
- Stream HLS se `VITE_API_URL` não configurado na Vercel

---

## Divisão sugerida

| Você | Programador |
|------|-------------|
| Fluxo de negócio, simulador, textos IA | Network, Supabase, Edge logs |
| Implantação, Telegram | Agente, RLS, secrets |
| Demo para contratante | curl, migrations |

---

Ver também: [`../README.md`](../README.md) · [`AI_ARCHITECTURE.md`](AI_ARCHITECTURE.md) · [`../RUNBOOK_INCIDENTES.md`](../RUNBOOK_INCIDENTES.md)

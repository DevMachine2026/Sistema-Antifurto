# Roteiro de Demonstração — Olho Vivo

**Duração:** 15–20 minutos
**Objetivo:** Mostrar ao contratante como o sistema detecta fraudes automaticamente

---

## Preparação (antes da reunião)

1. Execute `supabase/seed_demo.sql` no SQL Editor do Supabase
2. Abra o sistema em produção (ou `npm run dev` para demo local)
3. Deixe o Dashboard visível na tela

---

## Ato 1 — O Contexto (2 min)

> *"Imagine uma sexta-feira no Bar Central. O movimento começa às 19h, atinge pico de 85 pessoas às 22h e termina à meia-noite. Esse sistema monitorou tudo em tempo real — sem ninguém olhando."*

**Mostre o Dashboard:**
- Métricas no topo: Consumo vs Pagamentos
- Gráfico de Vendas vs Fluxo de Câmera
- Destaque o **Gap vermelho** — já visível nos dados de demo

---

## Ato 2 — Anomalia R02: Gap Financeiro (5 min)

O que aconteceu nessa noite:
- ST Ingressos (bilheteria) registrou **~R$ 4.672**
- PagBank (maquineta) registrou **~R$ 3.521**
- **Gap: R$ 1.151** — detectado automaticamente

> *"O sistema de pedidos diz que vendeu R$ 4.672. A maquineta registrou R$ 3.521. Cadê esse dinheiro?"*

**Mostre a aba Alertas:**
- Alerta R02 em vermelho: divergência crítica
- Contexto do alerta com os valores detalhados
- Botão **"Notificar Staff"** → notificação WhatsApp/Telegram

> *"O proprietário recebeu esse alerta no celular em tempo real. Não no relatório do dia seguinte."*

---

## Ato 3 — Anomalia R01: Salão Cheio, Caixa Vazio (5 min)

> *"Às 22h, a câmera registrou 85 pessoas no salão. O sistema de pedidos não registrou nenhuma venda entre 21h30 e 22h30. Uma hora inteira. Bar lotado, zero lançamento."*

**Mostre no gráfico do Dashboard:**
- Linha de pessoas sobe para 85
- Linha de vendas cai para zero no mesmo período
- O sistema cruzou automaticamente e disparou o alerta

> *"Pode ser garçom desviando em dinheiro. Pode ser falha de sistema. Qualquer que seja, o proprietário foi alertado em até 30 minutos — não no dia seguinte."*

---

## Ato 4 — Como a câmera funciona (3 min)

> *"Não é necessário nenhum firmware especial. Instalamos um software no computador do estabelecimento — o Olho Vivo Agent."*

**Mostre a aba Agentes:**
- Agente com status **Online**
- Câmeras descobertas automaticamente na rede
- Contagem em tempo real: entrou / saiu / pessoas dentro

> *"O agente roda em qualquer PC com Windows. Usa inteligência artificial (YOLOv8) para contar pessoas pelo vídeo — sem configurar nada na câmera."*

---

## Ato 5 — Resolução e Auditoria (2 min)

1. Clique no alerta R02
2. Mostre os dados de contexto (pagbank_total, st_total, diferença)
3. Clique em **"Auditado & Validado"** → alerta resolvido
4. Mostre o histórico com nome do auditor e timestamp

> *"Cada decisão fica registrada. Isso vale em processo trabalhista, em seguro e em demissão por justa causa."*

---

## Ato 6 — Escalabilidade (2 min)

> *"O sistema funciona para 1 bar ou para 50. Cada estabelecimento tem seu próprio painel, regras configuráveis e agente independente."*

Próximas regras no roadmap:
- R03: Velocidade anormal de vendas por operador
- R06: Desconto excessivo por operador
- Multi-câmera: entrada, saída, caixa, área VIP

---

## Perguntas Esperadas

| Pergunta | Resposta |
|---|---|
| "E se a câmera falhar?" | O agente detecta a falha, tenta reconectar. R01 só dispara com dados confirmados — sem falsos positivos. |
| "Os dados ficam onde?" | Banco na nuvem (Supabase/PostgreSQL) com backup automático. Nada local. |
| "Quanto custa instalar?" | O agente é um arquivo .exe que o dono baixa e executa. Sem técnico, sem configuração de câmera. |
| "E a LGPD?" | Câmeras contam silhuetas — não identificam rostos. Nenhum dado biométrico armazenado. |
| "Funciona com qualquer câmera?" | Qualquer câmera com cabo de rede. Intelbras, Hikvision, Dahua, genérica. |

---

## Números para Impressionar

- **Detecção em < 30 minutos** após o evento
- **Zero dependência humana** — roda 24/7 automático
- **Custo médio de fraude não detectada:** R$ 500–2.000/mês por estabelecimento
- **ROI:** 1 fraude detectada por mês já paga o sistema

---

*Olho Vivo — Dev Machine*

# Roteiro de Demonstração — Sistema Antifraude

**Duração estimada:** 15–20 minutos  
**Objetivo:** Mostrar ao contratante como o sistema detecta fraudes reais automaticamente

---

## Preparação (antes da reunião)

1. Execute `supabase/seed_demo.sql` no SQL Editor do Supabase
2. Abra o sistema em `http://localhost:3000` (ou URL de produção)
3. Deixe o Dashboard visível na tela

---

## Roteiro da Apresentação

### Ato 1 — O Contexto (2 min)

> *"Imagine uma sexta-feira no Bar Central. O movimento começa às 19h, atinge pico de 85 pessoas às 22h e termina à meia-noite. Esse sistema monitorou tudo em tempo real."*

**Mostre o Dashboard:**
- Métricas no topo: Consumo vs Pagamentos
- Gráfico de Vendas vs Fluxo de Câmera
- Destaque o **GAP vermelho** — já está visível

---

### Ato 2 — Anomalia R02: Gap Financeiro (5 min)

**O que aconteceu nessa noite:**
- ST Ingressos (sistema de pedidos) registrou **~R$ 4.672**
- PagBank (maquineta) registrou **~R$ 3.521**
- **Gap: R$ 1.151** — o motor detectou automaticamente

> *"Repara que o sistema de pedidos diz que vendeu R$ 4.672, mas a maquineta registrou apenas R$ 3.521. Cadê esse dinheiro?"*

**Mostre a aba Alertas de Fraude:**
- Alerta R02 em vermelho: `Divergência Crítica detectada entre PagBank e Bilheteria`
- Mostre o contexto do alerta (valores detalhados)
- Demonstre o botão **"Notificar Staff"** → abre WhatsApp com mensagem pronta

> *"O proprietário teria recebido essa notificação no celular em tempo real, sem precisar abrir nenhum relatório."*

---

### Ato 3 — Anomalia R01: Salão Cheio, Caixa Vazio (5 min)

> *"Às 22h, a câmera registrou 85 pessoas no salão. Mas o sistema de pedidos não registrou nenhuma venda entre 21h30 e 22h30. Uma hora inteira. Bar lotado, zero lançamento."*

**Mostre no gráfico do Dashboard:**
- Linha tracejada (pessoas) sobe para 85
- Linha azul (vendas) cai para zero no mesmo período
- O sistema cruzou isso automaticamente e disparou o alerta

> *"Pode ser um funcionário desviando vendas em dinheiro. Pode ser uma falha de sistema. Qualquer que seja a causa, o proprietário foi alertado em até 30 minutos — não no dia seguinte quando já não há como investigar."*

---

### Ato 4 — Fluxo de Resolução (3 min)

**Demonstre o workflow completo:**
1. Clique no alerta R02 na aba de Alertas
2. Mostre as informações de contexto (pagbank_total, st_total, diff)
3. Clique em **"Auditado & Validado"** → alerta movido para Resolvidos
4. Mostre o histórico de alertas resolvidos com o nome do auditor

> *"Cada decisão fica registrada: quem resolveu, quando resolveu, e os dados originais que geraram o alerta. Isso é trilha de auditoria — vale em processo trabalhista, em seguro e em demissão por justa causa."*

---

### Ato 5 — Escalabilidade (2 min)

> *"O sistema foi desenhado para crescer. Hoje detecta R01 e R02. Mas o motor de regras está pronto para:"*

- R03: Pico anormal de vendas (funcionário passando valores inflados)
- R04: Janela morta no horário de pico
- R05: Padrão de cancelamentos suspeitos por operador
- Integração com balanças (peso na câmera vs peso registrado — como no açougue)
- Multi-estabelecimento: um dashboard para 10 bares ao mesmo tempo

---

## Perguntas Esperadas e Respostas

**"E se a câmera falhar?"**
> O sistema registra o evento de falha e não dispara falsos positivos. R01 só aciona quando há dados confirmados de câmera.

**"Os dados ficam onde?"**
> Banco de dados seguro na nuvem (Supabase/PostgreSQL), com backup automático. Nada fica só no computador.

**"Quanto custa para colocar em produção?"**
> Infraestrutura custa entre R$ 200–400/mês. O investimento principal é integrar com as câmeras e maquinetas do estabelecimento (feito uma vez).

**"E a LGPD?"**
> As câmeras não gravam rostos — apenas contam pessoas. Nenhum dado biométrico é armazenado.

---

## Números para Impressionar

- **Tempo de detecção:** < 30 minutos após o evento
- **Sem dependência humana:** roda 24/7 automático
- **Custo médio de um garçom desonesto:** R$ 500–2.000/mês desviados
- **ROI do sistema:** Se pega 1 fraude/mês de R$ 500, paga a infraestrutura e ainda sobra

---

*Sistema Antifraude — RonalDigital*

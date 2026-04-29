# Guia de Operacao - Sistema Antifraude

Este guia organiza o uso do sistema em rotina real de bar: inicio do turno, operacao, fechamento e tratamento de incidentes.

---

## 1) Finalidade do sistema

O sistema cruza quatro fontes para detectar inconsistencias:

- ocupacao do salao
- eventos de pagamento em dinheiro
- valor recebido em pagamentos eletronicos
- valor de vendas registradas

Quando identifica um desvio, gera alerta com contexto para decisao rapida.

---

## 2) Rotina por etapa

## Abertura do turno (2 a 5 minutos)

1. Entrar no **Dashboard** e validar se os dados atualizaram nos ultimos minutos.
2. Abrir **Integracoes** e confirmar status ativo das entradas de dados.
3. Abrir **Configuracoes** e revisar:
   - numero WhatsApp
   - chat_id do Telegram
   - thresholds de alerta

Se qualquer integracao estiver parada, registrar no livro de turno e acionar suporte antes do pico.

## Operacao durante o turno

1. Revisar **Alertas** em ciclos (exemplo: a cada 20-30 minutos).
2. Para cada alerta, decidir entre:
   - **procedente** (houve problema real)
   - **operacional** (erro de lancamento/processo)
   - **falso positivo** (dados incompletos/atrasados)
3. Registrar acao no fluxo de resolucao (quem verificou, o que encontrou, o que foi feito).

## Fechamento do turno

1. Garantir que alertas criticos do turno tenham status definido.
2. Revisar **Trilha de Auditoria** e confirmar registro das acoes principais.
3. Importar arquivos pendentes do periodo, se houver.
4. Entregar resumo de turno para o responsavel (3 linhas: alertas, causa, acao).

---

## 3) Leitura objetiva de cada alerta

## R01 - Salao cheio sem vendas

**Significa:** ocupacao alta sem vendas no intervalo configurado.  
**Checagem rapida:**

1. equipe esta lancando no sistema corretamente?
2. integracao de vendas esta atualizando?
3. houve fila/queda temporaria no caixa?

**Acao recomendada:** validar com gerente de pista e caixa; corrigir processo de lancamento imediatamente.

## R02 - Diferenca entre recebido e vendido

**Significa:** valor de pagamentos nao bate com valor de vendas.  
**Checagem rapida:**

1. fechamento parcial foi feito com filtros errados?
2. houve estorno/cancelamento nao refletido?
3. houve atraso de importacao no periodo?

**Acao recomendada:** conciliar por faixa de horario e operador; se permanecer diferenca, abrir investigacao formal.

## R05 - Dinheiro sem venda correspondente

**Significa:** houve indicio de pagamento em dinheiro sem lancamento relacionado.  
**Checagem rapida:**

1. existe venda em especie registrada no mesmo intervalo?
2. houve recebimento manual sem registro?
3. camera/entrada gerou duplicidade de evento?

**Acao recomendada:** tratar como prioridade alta; confirmar caixa fisico e operador envolvido.

---

## 4) Prioridade e prazo de resposta

Use este padrao para evitar subjetividade:

- **Alta (critica):** indico de desvio financeiro direto  
  - primeira analise: ate 15 min
  - decisao inicial: ate 30 min
- **Media:** risco operacional sem evidencia direta de desvio  
  - primeira analise: ate 60 min
- **Baixa:** ruido pontual sem impacto financeiro  
  - revisar no fechamento do turno

---

## 5) Notificacoes

- **Telegram:** aviso automatico imediato.
- **WhatsApp:** abre mensagem pronta a partir da notificacao do navegador.

Se o aviso nao chegar:

1. testar envio em **Configuracoes**
2. validar conexao e permissao de notificacao no navegador
3. confirmar chat_id e numero configurados

---

## 6) Padrao de resolucao de alerta

Ao resolver um alerta, use esta estrutura curta:

- **Causa:** o que gerou o alerta
- **Verificacao:** como foi conferido
- **Acao:** o que foi ajustado
- **Responsavel:** quem executou

Isso deixa a trilha de auditoria util para revisao semanal.

---

## 7) Indicadores minimos para acompanhamento

No minimo, acompanhe:

- quantidade de alertas por turno
- tempo medio de resposta por alerta
- percentual de alertas procedentes
- reincidencia por tipo (R01/R02/R05)

Com esses quatro numeros, a operacao melhora semana a semana.

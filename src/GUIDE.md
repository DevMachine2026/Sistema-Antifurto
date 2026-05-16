# Guia de Operação — Sistema Antifraude

Este guia tem dois blocos. Comece pelo que se aplica a você:

- **Parte 1 — Para o gerente e a equipe de turno:** como usar o sistema no dia a dia, entender os alertas e agir com rapidez.
- **Parte 2 — Para o técnico de implantação:** como configurar câmeras, integrações e validar a instalação.

---

# Parte 1 — Operação diária

## O que o sistema faz

O sistema monitora quatro fontes ao mesmo tempo e gera um alerta quando os números não batem:

- **Pessoas no salão** — câmeras contam entradas e saídas em tempo real
- **Dinheiro manuseado no caixa** — câmera detecta manuseio de cédulas
- **Pagamentos eletrônicos** — dados da maquineta PagBank
- **Vendas registradas** — ST Ingressos ou sistema de bilheteria

Quando detecta uma inconsistência, o sistema envia aviso pelo Telegram e/ou WhatsApp e registra o alerta para análise.

---

## O que cada aba do menu faz

| Aba | Para que serve |
|---|---|
| **Dashboard** | Visão geral em tempo real: pessoas no salão, vendas, últimos alertas |
| **Alertas de Fraude** | Lista de alertas; é aqui que você analisa e registra o que foi feito |
| **POS × Vídeo** | Cruza cada transação com a imagem da câmera do caixa no momento exato |
| **Importar Dados** | Envio manual de arquivos da bilheteria (PDF) e da maquineta (CSV) |
| **Integrações** | Status de cada fonte de dados e código de autenticação para instalação |
| **Câmeras** | Câmeras detectadas pelo agente aparecem aqui automaticamente. Se necessário, adicione manualmente pelo IP |
| **Agentes** | Instala o software de monitoramento nos computadores locais |
| **Simulador Demo** | Testa o fluxo de alerta sem precisar de dados reais |
| **Trilha Auditoria** | Histórico completo de todas as ações registradas no sistema |
| **Configurações** | Número de WhatsApp e conta do Telegram para receber alertas |
| **Prontidão** | Checklist automático antes de iniciar a operação |

---

## Rotina de turno

### Abertura (2 a 5 minutos)

1. Abrir o **Dashboard** — confirmar que os dados atualizaram nos últimos minutos
2. Abrir **Integrações** — cada fonte deve exibir **Ativo** com horário recente
3. Abrir **Prontidão** — todos os itens da lista devem estar marcados como ok

Se qualquer integração estiver parada, acione o suporte **antes** do pico de movimento.

### Durante o turno

1. Abrir **Alertas de Fraude** a cada 20 a 30 minutos
2. Para cada alerta, classificar:
   - **Procedente** — problema real confirmado
   - **Operacional** — falha de processo ou lançamento incorreto
   - **Falso positivo** — dado incompleto ou atrasado
3. Registrar a decisão no campo de resolução do alerta

### Fechamento

1. Garantir que todos os alertas críticos tenham decisão registrada
2. Abrir **Trilha Auditoria** e confirmar registro das ações principais
3. Em **Importar Dados**, enviar os arquivos pendentes (PDF da bilheteria, CSV da maquineta)
4. Entregar resumo ao responsável: alertas gerados, causa identificada, ação tomada

---

## Como ler cada tipo de alerta

### R01 — Salão cheio sem vendas

O sistema detectou muitas pessoas no ambiente mas nenhuma venda registrada no período.

**Verifique:**
1. A equipe está lançando as vendas corretamente no sistema?
2. A integração com a bilheteria está atualizando?
3. Houve fila ou interrupção temporária no caixa?

**Ação:** confirmar com o gerente de pista e o caixa; corrigir o lançamento imediatamente.

---

### R02 — Diferença entre recebido e vendido

O valor de pagamentos recebidos não bate com o valor de vendas registradas.

**Verifique:**
1. O período do relatório foi filtrado corretamente?
2. Houve estorno ou cancelamento não refletido no sistema?
3. Algum arquivo de importação está pendente?

**Ação:** conciliar por faixa de horário e operador; se a diferença persistir, abrir investigação formal.

---

### R05 — Dinheiro sem venda correspondente

A câmera do caixa detectou manuseio de cédulas sem lançamento correspondente no sistema.

**Verifique:**
1. Existe venda em espécie registrada no mesmo intervalo?
2. Houve recebimento manual sem registro?

**Ação:** prioridade máxima — confirmar o caixa físico e identificar o operador envolvido imediatamente.

---

## Prazo de resposta por nível

| Nível | Critério | Primeira análise | Decisão final |
|---|---|---|---|
| **Alta** | Indício de desvio financeiro direto | até 15 min | até 30 min |
| **Média** | Risco operacional sem evidência direta | até 60 min | no turno |
| **Baixa** | Ruído pontual sem impacto financeiro | no fechamento | no fechamento |

---

## Como registrar a resolução de um alerta

Ao resolver, preencha no sistema:

- **Causa:** o que gerou o alerta
- **Verificação:** como foi conferido
- **Ação:** o que foi corrigido
- **Responsável:** quem executou

Esse registro forma a trilha de auditoria para revisão semanal e auditorias externas.

---

## Notificações

- **Telegram:** aviso automático e imediato para o grupo ou usuário configurado
- **WhatsApp:** notificação no navegador; ao clicar, abre a mensagem pronta para envio

Se o aviso não chegar:
1. Acessar **Configurações** e usar o botão de teste de envio
2. Verificar permissão de notificação no navegador
3. Confirmar que o número e a conta do Telegram estão salvos corretamente

---

## Indicadores para revisão semanal

Acompanhe estes quatro números toda semana:

- Quantidade de alertas por turno
- Tempo médio de resposta por alerta
- Percentual de alertas procedentes
- Reincidência por tipo (R01 / R02 / R05)

---

# Parte 2 — Implantação técnica

Esta seção é para o **técnico responsável pela instalação**. O gerente de turno não precisa deste conteúdo para operar o sistema no dia a dia.

---

## Cadastro inicial

1. Na tela de login, clicar em **"Cadastrar meu comércio"**
2. Preencher: nome do responsável, nome do comércio, e-mail e senha
3. Fazer login com as credenciais criadas

---

## Código de autenticação e endereços de integração

1. Acessar a aba **Integrações** no menu lateral
2. Copiar o **código de autenticação** gerado automaticamente para o estabelecimento
3. Copiar os três endereços de integração exibidos na tela:
   - Câmeras de contagem
   - Detecção de dinheiro (caixa)
   - ST Ingressos (bilheteria)

Esses três itens são tudo que o técnico das câmeras e a equipe da bilheteria precisam para configurar.

---

## Câmeras de contagem de pessoas (Regra R01)

Função: contar quantas pessoas entram e saem do salão em tempo real.

### Fluxo automático (recomendado)

Com o agente instalado e online, **nenhuma configuração de câmera é necessária**. O agente:

1. Escaneia a rede local via ONVIF ao iniciar
2. Registra as câmeras encontradas diretamente no painel (aba **Câmeras**)
3. Inicia a contagem de pessoas automaticamente

O gerente abre o painel → câmeras já aparecem → operação imediata.

### Câmeras sem ONVIF

Se a câmera não aparecer automaticamente na aba Câmeras após 2–3 minutos:

1. Abrir o app do fabricante no celular (IntelbrasCAM, iDMSS, DMSS, Hik-Connect)
2. Anotar o IP exibido no app
3. Acessar **Câmeras → Adicionar manualmente** → informar o IP

### Câmeras Intelbras com People Counting nativo (webhook)

Quando a câmera suporta envio direto de People Counting via webhook (sem agente):

- Ativar evento: **People Counting** na interface da câmera/NVR
- Destino do evento: endereço de integração de câmeras (aba Integrações)
- Cabeçalho de autenticação: `Authorization: Bearer SEU_TOKEN`
- Intervalo de envio: 5 ou 10 minutos

**Identificadores de câmera recomendados (modo webhook):**
- `cam-area-01` — ambiente principal (pista, salão)
- `cam-area-02` — segundo ambiente (área VIP, varanda)
- `cam-caixa` — caixa/bilheteria

---

## Câmera de detecção de dinheiro no caixa (Regra R05)

Função: identificar quando alguém manuseia cédulas no caixa sem lançamento correspondente.

**Equipamento necessário:**
- 1 câmera apontada para a área do caixa ou bilheteria
- Raspberry Pi 4 com modelo de visão computacional (fornecido ou configurado pela Dev Machine)

O Raspberry Pi processa as imagens localmente e envia o evento automaticamente. Detecções com nível de certeza abaixo de 70% são descartadas para evitar falsos positivos.

---

## Integração com ST Ingressos

**Opção A — Envio automático (recomendado)**

Solicitar à equipe técnica da ST Ingressos a configuração de envio automático de transações:

- **Endereço:** copiar da aba Integrações
- **Método:** POST
- **Autenticação:** `Authorization: Bearer SEU_TOKEN`
- **Formato esperado:**

```json
{
  "amount": 45.00,
  "occurred_at": "2026-04-29T21:10:00Z",
  "payment_method": "pix",
  "operator_id": "op-01",
  "transaction_id": "ST-00123"
}
```

Formas de pagamento aceitas: `pix`, `credito`, `debito`, `dinheiro`, `especie`

**Opção B — Importação manual de PDF**

1. Exportar relatório PDF no sistema da ST Ingressos
2. Acessar **Importar Dados** no menu lateral
3. Selecionar o arquivo e aguardar o processamento

---

## Integração com PagBank

1. Exportar o relatório de transações do período no app PagBank (formato CSV)
2. Acessar **Importar Dados** no menu lateral
3. Selecionar o arquivo exportado

---

## Validação da instalação

1. Acessar **Integrações** — cada fonte deve exibir **Ativo** com data recente
2. Acessar a aba **Simulador Demo** e executar uma simulação de alerta R01
3. Verificar se o alerta aparece em **Alertas de Fraude**
4. Confirmar o recebimento da notificação no Telegram e/ou WhatsApp

**Se uma integração não aparecer como ativa, verificar:**
- O código de autenticação está correto (`Authorization: Bearer SEU_TOKEN`)
- O endereço de integração aponta para o estabelecimento correto
- A câmera ou script está enviando dados no formato esperado

---

## Configuração das notificações

Em **Configurações**:

- **WhatsApp:** inserir número com código do país e DDD — exemplo: `5585991993833`
- **Telegram:** clicar em **Conectar Telegram**; o sistema abrirá o bot `@sistemantifraude_bot` — basta clicar em **Iniciar** dentro do Telegram

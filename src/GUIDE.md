# Guia de Operacao - Sistema Antifraude

Este guia cobre dois perfis: **instalacao e integracao** (para o tecnico ou responsavel pela implantacao) e **operacao diaria** (para o gerente ou responsavel pelo turno).

---

## 1) O que o sistema faz

O sistema cruza quatro fontes para detectar inconsistencias financeiras e operacionais:

- ocupacao real do salao (cameras de contagem)
- deteccao de pagamento em dinheiro no caixa (camera dedicada)
- valor recebido em pagamentos eletronicos (maquineta PagBank)
- valor de vendas registradas (ST Ingressos ou sistema de bilheteria)

Quando identifica um desvio, gera alerta com contexto para decisao rapida e dispara notificacao via Telegram e/ou WhatsApp.

---

## 2) Configuracao inicial (implantacao)

### 2.1 Cadastro do estabelecimento

1. Acessar o sistema e clicar em **"Cadastrar meu comercio"** na tela de login
2. Preencher: nome do responsavel, nome do comercio, email e senha
3. Fazer login com as credenciais criadas

### 2.2 Token e URLs dos webhooks

1. Acessar a aba **Integracoes** no menu lateral
2. Copiar o **token de autenticacao** gerado automaticamente para o estabelecimento
3. Copiar as URLs dos webhooks exibidas na tela:
   - URL cameras de contagem
   - URL deteccao de dinheiro (caixa)
   - URL ST Ingressos

Esses tres itens sao tudo que o tecnico das cameras e a equipe da bilheteria precisam para configurar.

---

## 3) Integracao das cameras

### 3.1 Cameras de contagem de pessoas (Regra R01)

Funcao: contar quantas pessoas entram e saem do salao em tempo real.

**Cenario A — Cameras Intelbras com suporte ISAPI (recomendado)**

Configurar na interface da camera (ou NVR Intelbras):
- Ativar evento: **People Counting**
- Destino do evento: URL do webhook de camera
- Header de autenticacao: `Authorization: Bearer SEU_TOKEN`
- Intervalo de envio: a cada 5 ou 10 minutos

A camera envia automaticamente no formato correto. Nenhum script adicional e necessario.

**Cenario B — Cameras genericas (Hikvision, Dahua, IP generica)**

Necessario um intermediario (Raspberry Pi ou servidor local) com script que:
1. Le a contagem da camera via RTSP ou API propria
2. Envia POST para a URL do webhook no formato:

```json
{
  "camera_id": "cam-area-01",
  "count_in": 60,
  "count_out": 5,
  "people_inside": 55,
  "recorded_at": "2026-04-29T21:00:00Z"
}
```

**IDs de camera recomendados:**
- `cam-area-01` — ambiente principal (pista, salao)
- `cam-area-02` — segundo ambiente (area VIP, varanda)
- `cam-caixa` — bilheteria/caixa (usada para deteccao de dinheiro)

### 3.2 Camera de deteccao de dinheiro no caixa (Regra R05)

Funcao: identificar quando alguem manipula cedulas no caixa sem que haja lancamento correspondente no sistema.

**Equipamento necessario:**
- 1 camera apontada para a area de caixa/bilheteria
- Raspberry Pi 4 com modelo de visao computacional (fornecido ou configurado pela Dev Machine)

O Raspberry Pi processa as imagens localmente e envia o evento de deteccao automaticamente:

```json
{
  "camera_id": "cam-caixa",
  "detected_at": "2026-04-29T21:15:00Z",
  "confidence": 0.92
}
```

Deteccoes com confianca abaixo de 70% sao descartadas automaticamente para evitar falsos positivos.

---

## 4) Integracao com ST Ingressos (bilheteria)

### Opcao A — Webhook automatico (recomendado)

Solicitar para a equipe tecnica da ST Ingressos a configuracao de um **webhook de saida** para transacoes:

- **URL:** copiar da aba Integracoes no sistema
- **Metodo:** POST
- **Header:** `Authorization: Bearer SEU_TOKEN`
- **Formato do payload:**

```json
{
  "amount": 45.00,
  "occurred_at": "2026-04-29T21:10:00Z",
  "payment_method": "pix",
  "operator_id": "op-01",
  "transaction_id": "ST-00123"
}
```

Metodos de pagamento aceitos: `pix`, `credito`, `debito`, `dinheiro`, `especie`

### Opcao B — Import manual de PDF

Ao final do turno (ou quando necessario):
1. Exportar relatorio PDF no sistema da ST Ingressos
2. Acessar **Importar Dados** no menu lateral
3. Selecionar o arquivo PDF e aguardar o processamento

O sistema extrai as transacoes automaticamente do PDF.

---

## 5) Integracao com PagBank (maquineta)

Import manual via CSV:
1. Abrir o app PagBank e exportar o relatorio de transacoes do periodo
2. Acessar **Importar Dados** no menu lateral
3. Selecionar o arquivo CSV exportado

---

## 6) Validacao da instalacao

Apos configurar todas as integracoes:

1. Acessar aba **Integracoes** — cada fonte deve exibir status **"Ativo"** com data do ultimo evento
2. Usar o botao **"Simular Alerta"** no cabecalho para testar o fluxo de deteccao R01
3. Verificar se o alerta aparece na aba **Alertas**
4. Confirmar recebimento da notificacao no Telegram e/ou WhatsApp

Se alguma integracao nao aparecer como ativa, verificar:
- Token correto no cabecalho `Authorization: Bearer`
- URL correta apontando para o estabelecimento certo
- Camera ou script enviando dados no formato esperado

---

## 7) Configuracao de notificacoes

Na aba **Configuracoes**:

- **WhatsApp:** inserir numero com DDI e DDD (ex: `5585991993833`)
- **Telegram:** inserir Chat ID do usuario ou grupo que deve receber os alertas

Para obter o Chat ID do Telegram:
1. Enviar uma mensagem para `@userinfobot` no Telegram
2. O bot responde com seu ID numerico

---

## 8) Rotina de operacao por etapa

### Abertura do turno (2 a 5 minutos)

1. Acessar o **Dashboard** e validar se os dados atualizaram nos ultimos minutos
2. Abrir **Integracoes** e confirmar status ativo de cada fonte
3. Revisar **Configuracoes**: numero WhatsApp, Chat ID Telegram e thresholds

Se qualquer integracao estiver parada, acionar suporte antes do pico de movimento.

### Durante o turno

1. Revisar **Alertas** em ciclos (a cada 20 a 30 minutos)
2. Para cada alerta, decidir entre:
   - **procedente** — houve problema real
   - **operacional** — erro de lancamento ou processo
   - **falso positivo** — dados incompletos ou atrasados
3. Registrar a acao no campo de resolucao do alerta

### Fechamento do turno

1. Garantir que todos os alertas criticos tenham status definido
2. Revisar **Trilha de Auditoria** e confirmar registro das acoes principais
3. Importar arquivos pendentes do periodo (PDF ST Ingressos, CSV PagBank)
4. Entregar resumo de turno para o responsavel (3 linhas: alertas, causa, acao)

---

## 9) Leitura objetiva de cada alerta

### R01 - Salao cheio sem vendas

**Significa:** ocupacao alta sem vendas no intervalo configurado.

Checagem rapida:
1. Equipe esta lancando no sistema corretamente?
2. Integracao de vendas esta atualizando?
3. Houve fila ou queda temporaria no caixa?

**Acao:** validar com gerente de pista e caixa; corrigir processo de lancamento imediatamente.

### R02 - Diferenca entre recebido e vendido

**Significa:** valor de pagamentos nao bate com valor de vendas registradas.

Checagem rapida:
1. Fechamento parcial foi feito com filtros errados?
2. Houve estorno ou cancelamento nao refletido?
3. Houve atraso de importacao no periodo?

**Acao:** conciliar por faixa de horario e operador; se permanecer diferenca, abrir investigacao formal.

### R05 - Dinheiro sem venda correspondente

**Significa:** camera detectou manipulacao de cedulas sem lancamento relacionado.

Checagem rapida:
1. Existe venda em especie registrada no mesmo intervalo?
2. Houve recebimento manual sem registro?
3. Camera gerou duplicidade de evento?

**Acao:** tratar como prioridade alta; confirmar caixa fisico e operador envolvido imediatamente.

---

## 10) Prioridade e prazo de resposta

| Nivel | Criterio | Primeira analise | Decisao |
|-------|----------|-----------------|---------|
| **Alta** | Indicio de desvio financeiro direto | ate 15 min | ate 30 min |
| **Media** | Risco operacional sem evidencia direta | ate 60 min | no turno |
| **Baixa** | Ruido pontual sem impacto financeiro | no fechamento | no fechamento |

---

## 11) Notificacoes

- **Telegram:** aviso automatico e imediato para o grupo ou usuario configurado
- **WhatsApp:** push no navegador que abre mensagem pronta ao clicar

Se o aviso nao chegar:
1. Testar envio direto em **Configuracoes**
2. Validar conexao e permissao de notificacao no navegador
3. Confirmar Chat ID e numero configurados corretamente

---

## 12) Padrao de resolucao de alerta

Ao resolver um alerta, registrar:

- **Causa:** o que gerou o alerta
- **Verificacao:** como foi conferido
- **Acao:** o que foi ajustado
- **Responsavel:** quem executou

Isso deixa a trilha de auditoria util para revisao semanal e para eventuais auditorias externas.

---

## 13) Indicadores minimos para acompanhamento semanal

- Quantidade de alertas por turno
- Tempo medio de resposta por alerta
- Percentual de alertas procedentes
- Reincidencia por tipo (R01 / R02 / R05)

Com esses quatro numeros, a operacao melhora semana a semana.

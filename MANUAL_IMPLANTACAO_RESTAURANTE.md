# Manual do Olho Vivo — Guia do Estabelecimento

Guia para o **dono ou gestor** do estabelecimento e para **quem faz a implantação** no local.
Escrito em linguagem direta, organizado do mais simples ao mais avançado.

---

## 1. O que o sistema faz

O **Olho Vivo** monitora seu bar, restaurante ou casa de eventos de três formas simultâneas:

| O que monitora | Como faz | Para que serve |
|---|---|---|
| **Pessoas no salão** | Câmera IP + IA (YOLOv8) | Saber quantas pessoas estão no local a cada momento |
| **Caixa** | Câmera do caixa | Detectar quando dinheiro passa pelo caixa |
| **Vendas e pagamentos** | Importação de PDF/CSV ou webhook | Cruzar com os dados de câmera |

Quando os dados não batem — salão cheio mas sem vendas, dinheiro no caixa sem lançamento, gap entre maquineta e bilheteria — o sistema dispara um alerta no seu Telegram em segundos.

---

## 2. O agente local (PC do estabelecimento)

O **Agente Olho Vivo** é um programa instalado num **computador Windows** no local. Ele:

- lê as câmeras pela rede local (sem precisar de internet para isso);
- conta pessoas com inteligência artificial no momento de cada entrada e saída;
- **captura uma foto no exato instante da detecção** e envia para a nuvem;
- monitora a câmera do caixa e mantém um histórico dos últimos 60 segundos de frames;
- descobre câmeras automaticamente na rede (ONVIF + varredura de portas).

Você **não** precisa instalar Python, Docker, abrir terminal ou mexer em arquivos de configuração.

---

## 3. Instalação do agente (Windows)

### Passo 1 — Baixar pelo painel

1. Acesse o painel → **Agentes** → clique no botão de instalação do agente desejado.
2. O navegador baixa um arquivo com nome parecido com:

   ```
   OlhoVivoSetup_TOKEN_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.exe
   ```

   O trecho depois de `TOKEN_` é o código único do seu agente. **Não renomeie o arquivo.**

### Passo 2 — Instalar

1. Dê dois cliques no instalador baixado.
2. Clique em **Avançar / Next** até concluir. Administrador **não é necessário** na instalação padrão.
3. Ao terminar, o agente inicia sozinho e fica configurado para **abrir automaticamente quando o Windows ligar**.

### Passo 3 — Confirmar no painel

1. Aguarde até 1 minuto e verifique se o agente aparece como **Online** no painel → Agentes.
2. Quando câmeras forem descobertas automaticamente, **aprove** as que serão usadas para contagem.

> O token de autenticação vem embutido no nome do arquivo — o instalador cuida de tudo. O dono do negócio não vê nem digita nenhum código.

---

## 4. Câmeras — tipos e como cadastrar

### Dois tipos de câmera

| Tipo | Onde fica | Para que serve |
|---|---|---|
| **Câmera de contagem** | Entrada/saída do local | Conta quantas pessoas entram e saem |
| **Câmera do caixa** | Apontada para o caixa/maquineta | Detecta quando dinheiro passa pelo caixa |

### Como as câmeras chegam ao sistema

**Via agente (automático, recomendado):**
O agente descobre câmeras IP na rede local via ONVIF e varredura de portas. Elas aparecem na aba **Agentes** para aprovação com um clique.

**Via wizard manual:**
Acesse **Câmeras → + Adicionar câmera** e siga as 5 etapas: marca → IP/porta → nome e tipo → configuração do firmware → teste de stream.

### DVRs

O agente detecta DVRs automaticamente. Quando um DVR aparece na aba Agentes:

1. Clique em **Configurar DVR**.
2. Confirme (ou preencha) usuário, senha e número de canais.
3. Clique em **Aprovar** — o sistema cria uma câmera por canal.

---

## 5. Importar dados de vendas

O sistema cruza dados de câmera com dados financeiros. Para isso, importe:

| Fonte | Formato | Onde importar |
|---|---|---|
| **ST Ingressos** | PDF do relatório | Menu → Importar Dados → ST Ingressos |
| **PagBank** | CSV de transações | Menu → Importar Dados → PagBank |

Antes de confirmar, o sistema mostra um preview com total de linhas e possíveis erros. O histórico de todas as importações fica disponível na mesma tela.

---

## 6. O que você vê no painel — do mais simples ao mais detalhado

### 6.1 Dashboard — visão geral

A primeira tela que você abre. Mostra em tempo real:

- Total de pessoas no salão agora
- Total de vendas ST Ingressos e PagBank
- Gap financeiro (diferença entre as duas fontes)
- Alertas ativos (vermelho = não resolvidos)
- Gráfico de Vendas × Pessoas por hora
- **Feed de Evidências Visuais**: faixa com fotos tiradas no momento de cada entrada/saída detectada

**Como usar o Feed de Evidências:**
Role a faixa horizontalmente para ver os eventos mais recentes. Clique em qualquer foto para abrir em tela cheia com todos os detalhes: hora exata, câmera, direção (entrada ou saída), contagem acumulada e quantas pessoas estavam no local naquele momento.

### 6.2 Alertas — o que o sistema detectou

Quando uma regra antifraude dispara, o alerta aparece aqui. Você pode:

- Ver todos os alertas ativos e resolvidos
- Filtrar por severidade
- Resolver um alerta com seu nome registrado (auditoria)
- Acionar a equipe via WhatsApp direto pelo alerta

**Tipos de alerta:**

| Alerta | O que aconteceu |
|---|---|
| Salão cheio, caixa vazio | Muitas pessoas no salão sem nenhuma venda nos últimos minutos |
| Gap financeiro | Diferença grande entre o total do PagBank e o do ST Ingressos |
| Cash Ghost | Dinheiro passou pelo caixa mas não tem lançamento na bilheteria |

### 6.3 POS × Vídeo — investigação profunda do caixa

**Esta é a tela mais poderosa do sistema.**

Ela mostra uma **linha do tempo** que cruza cada transação financeira com o evento da câmera do caixa mais próximo (dentro de ±10 minutos). Cada linha mostra:

- Foto tirada pela câmera no momento do evento (clique para ampliar)
- Horário da transação e da detecção pela câmera
- Valor e método de pagamento
- Operador (se disponível)
- Quanto tempo separou a transação do evento de câmera (delta)
- Status com código de cores:

| Cor / Status | Significado | O que fazer |
|---|---|---|
| ✅ Verde — Sincronizado | Transação + câmera dentro da janela de 10 min | Normal, tudo certo |
| ⚠️ Amarelo — Sem evidência | Pagamento em dinheiro sem câmera correspondente | Investigar se a câmera está funcionando |
| 🚨 Vermelho — Caixa sem venda | Câmera detectou dinheiro mas **nenhuma venda foi lançada** | Ação imediata — possível fraude |
| — Cinza — Cartão/PIX | Pagamento sem dinheiro (câmera não esperada) | Normal |

Quando existem eventos vermelhos ("Caixa sem venda"), um **banner de alerta** é exibido automaticamente no topo da tela com a contagem de ocorrências.

**Filtros disponíveis:**
- Por período: Hoje / Ontem / 7 dias / 30 dias
- Por status: Todos / Caixa sem venda / Sem evidência / Sincronizados / Cartão/PIX

**Para investigar um evento:** clique em qualquer linha para abrir o lightbox com a foto completa, hora exata da transação, hora da detecção pela câmera e o delta entre os dois eventos.

---

## 7. Configurações essenciais

Acesse **Menu → Configurações** para:

| Configuração | O que ajustar |
|---|---|
| **Telegram** | Cole o Chat ID e clique em Testar para receber alertas |
| **WhatsApp** | Informe o número (com DDI+DDD) e teste |
| **Regra R01** | Quantas pessoas no salão ativam o alerta + janela de tempo sem vendas |
| **Regra R02** | A partir de qual diferença financeira o alerta dispara |
| **Horário de monitoramento** | Defina o horário de funcionamento (ex: 18h às 04h) |

---

## 8. Prontidão — verificar antes de abrir

Antes de cada evento ou dia de operação, acesse **Menu → Prontidão**. O sistema verifica automaticamente:

- [ ] Token de webhook configurado
- [ ] Notificações ativas (Telegram ou WhatsApp)
- [ ] Câmeras enviando eventos
- [ ] Câmera do caixa ativa
- [ ] Dados de vendas chegando
- [ ] Stream de câmera funcionando

Se algum item estiver vermelho, resolva antes de abrir as portas.

---

## 9. Arquivos locais do agente (Windows)

O agente grava seus arquivos em:

```
C:\Users\SEU_NOME\AppData\Local\OlhoVivoAgent\
```

| Arquivo | Para que serve |
|---|---|
| `agente.log` | Registro de tudo que o agente fez — útil para suporte |
| `.olhovivo.env` | Configuração interna com o token (não edite) |
| `queue.db` | Fila de eventos para quando a internet cair |

**Não apague** esses arquivos sem orientação do suporte.

---

## 10. Desinstalar o agente

1. **Configurações do Windows → Aplicativos → Aplicativos instalados**
2. Procure **Olho Vivo Agente** e desinstale.

A pasta de logs (`OlhoVivoAgent`) pode permanecer — apague manualmente se quiser zerar os dados locais.

---

## 11. Problemas comuns

| Situação | O que fazer |
|---|---|
| Instalador recusa por falta de `TOKEN_` no nome | Baixe de novo pelo **link do painel** (não use o `.exe` genérico do GitHub) |
| Agente não aparece Online | Verifique internet, firewall do Windows e antivírus. Consulte `agente.log` |
| `agente.log` mostra `401 Unauthorized` | Problema com a chave de autenticação — entre em contato com o suporte |
| Câmeras não aparecem na aba Agentes | PC e câmeras precisam estar na mesma rede local (LAN) |
| Feed de evidências vazio | Confirme que o agente está atualizado e que o bucket `evidence` existe no Supabase |
| Fotos não carregam no lightbox | O bucket `evidence` no Supabase precisa estar configurado como **público** |
| DVR aparece sem canais | Clique em **Configurar DVR**, preencha manualmente usuário, senha e quantidade de canais |
| DVR aprovado mas não conta | Confirme que os canais do DVR têm stream RTSP ativo no firmware |
| POS × Vídeo não mostra fotos | A câmera do caixa precisa estar com o `CashMonitor` ativo (agente atualizado) |
| POS × Vídeo mostra tudo como "Sem evidência" | Importe dados do ST Ingressos/PagBank — a timeline cruza câmera com transações financeiras |

---

## 12. Ambiente de desenvolvimento / Linux

Para testes com o código-fonte (não Windows):

```bash
export ESTABLISHMENT_TOKEN="uuid-do-agente"
export SUPABASE_ANON_KEY="chave-anon-public-do-supabase"
export SUPABASE_URL="https://SEU_REF.supabase.co"
cd agent && pip install -r requirements.txt
python main.py
```

O `SUPABASE_ANON_KEY` está em **Supabase → Project Settings → API → anon / public**.

---

## 13. Para o administrador da plataforma (platform_admin)

### Registrar o bot Telegram (uma vez por deploy)

1. Acesse o painel com conta `platform_admin`.
2. No **Painel Administrativo**, clique em **Bot Telegram → Registrar Webhook**.
3. Aguarde a confirmação de sucesso.

A partir daí, cada comerciante que conectar seu Telegram em **Configurações → Conectar Telegram** terá o chat_id registrado automaticamente.

### Ativar / desativar estabelecimento

No Painel Administrativo, cada estabelecimento tem um botão de ativar/desativar. Estabelecimentos inativos continuam com dados preservados mas não recebem alertas.

---

**Olho Vivo v1.1 — By Dev Machine**

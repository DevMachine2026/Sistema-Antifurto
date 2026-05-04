# Manual de Implantação — Restaurante Eduardo
**Sistema Olho Vivo · Dev Machine**

---

## Visão geral antes de começar

O sistema tem **duas partes independentes**:

| Parte | O que faz | Precisa de quê |
|---|---|---|
| **Detecção de fraude** | Conta pessoas na entrada, cruza com vendas, dispara alerta no Telegram | Câmera com firmware de contagem + internet |
| **Vídeo ao vivo** | Exibe a imagem da câmera no dashboard | Raspberry Pi na rede local |

**Para a validação inicial, foque só na Parte 1.** O vídeo ao vivo é opcional e pode ser instalado depois.

---

## O que você precisa comprar / ter em mãos

| Item | Observação |
|---|---|
| Câmera IP com "People Counting" | Recomendado: **Intelbras VIP 3230** ou superior. Precisa estar na mesma rede Wi-Fi/cabo do roteador do restaurante. |
| Roteador com acesso à internet | Qualquer roteador doméstico ou comercial serve |
| Celular do Eduardo | Para configurar o bot do Telegram e receber alertas |

> Se o Eduardo já tem câmera Intelbras, Hikvision ou Dahua, verifique se o modelo tem "People Counting" no menu de configurações. Câmeras mais simples não têm essa função.

---

## Passo 1 — Criar a conta do restaurante no sistema

1. Acesse **https://sistema-antifurto.vercel.app**
2. Clique em **Criar conta**
3. Preencha:
   - Nome do comércio: `Restaurante do Eduardo` (ou o nome real)
   - E-mail e senha do Eduardo
4. Clique em **Cadastrar**
5. O sistema cria automaticamente o estabelecimento e redireciona para o dashboard

> Se o e-mail pedir confirmação, verifique a caixa de entrada. Se não chegar em 2 minutos, acesse o Supabase e desative "Confirm email" em Auth → Settings.

---

## Passo 2 — Configurar o Telegram para receber alertas

### 2a. Criar o bot (feito uma vez para sempre)

1. No celular do Eduardo, abra o Telegram
2. Pesquise por `@BotFather`
3. Envie o comando `/newbot`
4. Escolha um nome: `Olho Vivo Restaurante`
5. Escolha um username: `olhovivo_restaurante_bot`
6. O BotFather vai responder com um **token** parecido com: `7123456789:AAF...xyz`
7. **Guarde esse token** — você vai precisar dele

### 2b. Descobrir o Chat ID do Eduardo

1. Pesquise no Telegram pelo bot que você acabou de criar
2. Envie qualquer mensagem para ele (ex: "oi")
3. Acesse no browser: `https://api.telegram.org/botSEU_TOKEN/getUpdates`
   - Substitua `SEU_TOKEN` pelo token do passo anterior
4. Vai aparecer um JSON. Procure por `"id"` dentro de `"chat":`
   ```json
   "chat": { "id": 123456789, ... }
   ```
5. Esse número é o **Chat ID** — anote

### 2c. Configurar no Supabase (feito uma vez)

1. Acesse o painel do Supabase do projeto
2. Vá em **Edge Functions → Secrets**
3. Confirme que existe o secret `TELEGRAM_BOT_TOKEN` com o token do passo 2a
   - Se não existir: clique em **New secret**, nome `TELEGRAM_BOT_TOKEN`, valor = token do BotFather

### 2d. Configurar no sistema

1. No sistema (sistema-antifurto.vercel.app), faça login com a conta do Eduardo
2. Vá em **Configurações** (ícone de engrenagem na barra lateral)
3. No campo **Telegram Chat ID**, cole o número do Chat ID do passo 2b
4. Clique em **Salvar**
5. Clique em **Testar notificação** — Eduardo deve receber uma mensagem no Telegram em segundos

✅ **Status de validação (mai/2026):** teste de Telegram executado com sucesso no ambiente de implantação.

---

## Passo 3 — Instalar e configurar a câmera

### 3a. Posicionamento físico

Coloque a câmera **sobre a porta de entrada**, apontando para baixo, cobrindo todo o vão. Quanto mais centrada e mais alta, melhor a contagem.

```
     [câmera]
        ↓
|=== entrada ===|
```

### 3b. Acessar a interface da câmera

1. Conecte a câmera ao roteador via cabo de rede
2. Descubra o IP da câmera:
   - Acesse o roteador (geralmente `192.168.1.1`) → seção "Dispositivos conectados"
   - Ou use o app **IntelbrasCAM** no celular
3. Acesse o IP da câmera no browser: `http://192.168.1.XXX`
4. Login padrão Intelbras: usuário `admin`, senha `admin` ou em branco

### 3c. Ativar o People Counting na câmera

1. Dentro da interface da câmera, vá em:
   **Configurações → Inteligência / Smart → People Counting**
2. Ative a função
3. Configure a linha virtual no centro do vão da porta:
   - Linha horizontal no centro da imagem
   - Seta para cima = entrada, seta para baixo = saída
4. Salve

### 3d. Configurar o webhook da câmera

Esse é o passo que faz a câmera enviar os dados para o sistema.

**Pegue as credenciais no sistema:**
1. No sistema, vá em **Integrações**
2. Copie:
   - **URL do webhook:** `https://uoxcwvjtsebwmbsmyszj.supabase.co/functions/v1/webhook-camera`
   - **Token:** o token gerado para o estabelecimento

**Na interface da câmera (Intelbras):**
1. Vá em **Configurações → Rede → HTTP Push** (ou "Notificação HTTP")
2. Preencha:
   - URL: a URL copiada acima
   - Método: `POST`
   - Header de autenticação: `Authorization: Bearer SEU_TOKEN`
3. Salve e ative

> **Câmera Hikvision:** o caminho é `Configurações → Rede → HTTP Listening` ou `Event → HTTP Event`
> **Câmera Dahua:** o caminho é `Configurações → Rede → Notificação HTTP`

---

## Passo 4 — Cadastrar a câmera no sistema

1. No sistema, vá em **Câmeras**
2. Clique em **Adicionar câmera**
3. Preencha o wizard:
   - Marca: Intelbras (ou a marca da câmera)
   - IP: o IP da câmera (ex: `192.168.1.100`)
   - Porta: `80`
   - Nome: `Entrada Principal`
   - Tipo: **Contagem de pessoas**
4. Salve
5. O sistema vai mostrar o card da câmera com status **Online** quando os dados chegarem

---

## Passo 5 — Testar o sistema completo

### Teste básico (5 minutos):

1. Com o sistema aberto na tela **Dashboard**, peça para alguém entrar e sair da porta 3 vezes
2. Aguarde até 2 minutos e veja se o contador de "Pessoas no salão" aumenta
3. Se o contador subir, a câmera está comunicando corretamente ✅

### Teste de alerta (simula fraude):

A regra **R01** dispara quando há pessoas no salão mas nenhuma venda nos últimos X minutos.

1. Garanta que há pelo menos 1 pessoa contada como "dentro"
2. Não registre nenhuma venda por 15 minutos
3. O sistema deve criar um alerta na aba **Alertas de Fraude**
4. Eduardo deve receber a mensagem no Telegram:
   ```
   🚨 Alerta Olho Vivo
   Restaurante do Eduardo
   R01: X pessoas no salão sem vendas nos últimos 15 min.
   ```

> Se o alerta não chegar, vá em **Configurações → Testar notificação** para verificar se o Telegram está funcionando. Se funcionar no teste mas não no alerta, o problema é que nenhum dado de venda está chegando (normal se o POS ainda não foi integrado).

---

## Passo 6 — Integração com o caixa (opcional para validação)

Para o sistema detectar vendas automaticamente, o POS precisa enviar dados via webhook.

**Se o Eduardo usa PagBank/PagSeguro:**
1. No sistema, vá em **Integrações**
2. Siga as instruções da seção PagBank para exportar o CSV de transações
3. Na tela **Importar Dados**, faça o upload do CSV

**Se o Eduardo usa outro sistema:**
Entre em contato para analisar a integração específica. Qualquer sistema que possa fazer uma chamada HTTP pode ser integrado.

---

## Apêndice — Teste técnico com webcam local (equipe Dev)

Use este fluxo apenas para homologação técnica. Não substitui câmera IP de produção.

1. Subir stream local:
   ```bash
   USE_TESTSRC=1 ./scripts/dev-stream-local.sh
   ```
2. Subir backend local:
   ```bash
   cd server && npm run dev
   ```
3. Subir frontend:
   ```bash
   npm run dev
   ```
4. Cadastrar câmera de teste no Supabase:
   - `camera_id=teste`
   - `brand=generic`
   - `status=online`
   - `ip=127.0.0.1`

> Esse teste valida o player ao vivo (HLS). Contagem de pessoas continua dependendo de webhook/simulador.

---

## Resumo visual do fluxo

```
Eduardo entra no salão
        ↓
Câmera detecta → envia para o sistema
        ↓
Sistema acumula: 8 pessoas dentro
        ↓
Sistema verifica: alguma venda nos últimos 15 min?
   SIM → tudo ok, nenhum alerta
   NÃO → cria alerta + manda mensagem no Telegram do Eduardo
        ↓
Eduardo recebe no celular:
"🚨 8 pessoas no salão sem vendas nos últimos 15 min."
```

---

## Problemas comuns

| Problema | O que verificar |
|---|---|
| Câmera aparece offline no sistema | Câmera e servidor na mesma rede? IP correto? |
| Contador de pessoas não sobe | People Counting ativado na câmera? Linha virtual configurada? |
| Telegram não recebe | Chat ID correto? Token do bot no Supabase Secrets? Clicou em Salvar nas configurações? |
| Erro CORS ao testar Telegram no navegador | Confirmar deploy mais recente da Edge Function `send-telegram` (headers CORS com `x-client-info`) |
| Alerta não é criado | Alguma venda foi registrada no período? A regra só dispara se não houver vendas |
| Não consigo acessar a câmera pelo browser | Tente desligar e religar. Use o app do fabricante para descobrir o IP atual |

---

## Contatos / próximos passos

- **Vídeo ao vivo no dashboard:** requer Raspberry Pi conectado à rede do restaurante — instalar depois da validação
- **Integração com caixa em tempo real:** requer análise do sistema de POS do Eduardo
- **Suporte:** Ronald / Dev Machine

---

*Documento gerado em mai/2026 para implantação no restaurante do Eduardo — Fortaleza/CE*

# Manual de Implantação — Restaurante Eduardo
**Sistema Olho Vivo · Dev Machine**

---

## Como funciona

```
[Câmera IP]──── rede local ────[PC do restaurante]
                                   │  olhovivo-agent.exe
                                   │  (conta pessoas com IA)
                            [Supabase → Dashboard]
                                   │
                          [Telegram do Eduardo]
```

O **agente** é um executável único (`.exe` no Windows). O dono do restaurante só precisa baixar, colocar o token e executar. Sem instalar Python, sem configurar câmera, sem terminal.

---

## Pré-requisitos

| Item | Observação |
|---|---|
| **PC no restaurante** | Windows 10/11 ou Linux, com internet |
| **Câmera IP** | RTSP/ONVIF (Intelbras, Hikvision, Dahua...) na mesma rede do PC |
| **Celular do Eduardo** | Para receber alertas no Telegram |

---

## Passo 1 — Criar a conta do restaurante

1. Acesse **https://sistema-antifurto.vercel.app**
2. **Criar conta** → nome do comércio, e-mail, senha → **Cadastrar**

---

## Passo 2 — Configurar Telegram

### 2a. Criar o bot
1. Abra o Telegram → pesquise `@BotFather` → envie `/newbot`
2. Nome: `Olho Vivo Restaurante` | Username: `olhovivo_eduardo_bot`
3. BotFather devolve um **token** (ex: `7123456789:AAF...xyz`) — **anote**

### 2b. Descobrir o Chat ID
1. Abra o bot criado no Telegram e envie qualquer mensagem
2. Acesse no browser: `https://api.telegram.org/botSEU_TOKEN/getUpdates`
3. Procure `"chat": { "id": 123456789 }` — esse número é o **Chat ID**

### 2c. Configurar no sistema
1. No sistema → **Configurações** → campo **Telegram Chat ID** → cole o número → **Salvar**
2. Clique em **Testar notificação** — Eduardo deve receber no celular ✅

---

## Passo 3 — Criar o Agente e gerar o token

1. No sistema → menu **Agentes** (ícone de chip na barra lateral)
2. **Novo Agente** → Nome: `Restaurante do Eduardo` → **Criar**
3. No card criado, clique em **Revelar Token** e **copie o token**

---

## Passo 4 — Instalar o agente no PC do restaurante

### 4a. Baixar o executável

Acesse a página de releases do projeto e baixe o arquivo:
- **Windows:** `olhovivo-agent-windows.zip`
- **Linux:** `olhovivo-agent-linux.zip`

Extraia o zip. Vai criar uma pasta chamada `olhovivo-agent/`.

### 4b. Criar o arquivo de token

Dentro da pasta `olhovivo-agent/`, crie um arquivo chamado **`token.txt`** com apenas o token copiado no Passo 3:

```
a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

> Sem espaços, sem aspas. Só o token e nada mais.

### 4c. Executar

**Windows:** Clique duas vezes em `olhovivo-agent.exe`

**Linux:**
```bash
chmod +x olhovivo-agent/olhovivo-agent
./olhovivo-agent/olhovivo-agent
```

Uma janela de terminal vai abrir com os logs do agente:
```
INFO  agent starting v0.1.0
INFO  config fetched: agent_id=... cameras=0
INFO  ONVIF discovery started
INFO  heartbeat sent: cameras_online=0
```

### 4d. Verificar no AdminPanel

1. No sistema → **Agentes**
2. O card "Restaurante do Eduardo" deve mostrar **Online** ✅

---

## Passo 5 — Câmera descoberta e aprovada

### 5a. Posicionar a câmera

Posicione a câmera **sobre a porta de entrada**, apontando para baixo:

```
     [câmera]
        ↓↓↓
|=== entrada ===|
```
Altura ideal: 2,5m a 3m, cobrindo todo o vão.

### 5b. Conectar à mesma rede do PC

Câmera e PC precisam estar no mesmo roteador (cabo ou Wi-Fi).

### 5c. Aprovar a câmera no AdminPanel

O agente descobre câmeras automaticamente via ONVIF. Em até 2 minutos após iniciar:

1. No sistema → **Agentes** → card do restaurante
2. A câmera vai aparecer como candidata com o IP
3. Clique em **Aprovar**

O agente recebe a atualização e começa a contar automaticamente.

> **Câmera não apareceu?** Adicione manualmente com a URL RTSP:

| Fabricante | URL RTSP |
|---|---|
| Intelbras | `rtsp://admin:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0` |
| Hikvision | `rtsp://admin:SENHA@IP:554/Streaming/Channels/101` |
| Dahua | `rtsp://admin:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0` |

---

## Passo 6 — Testar

### Teste de contagem:
Peça para alguém entrar e sair da porta 3 vezes.
Os logs do agente devem mostrar:
```
← ENTROU  |  dentro=1  in=1  out=0
→ SAIU    |  dentro=0  in=1  out=1
```
O contador no dashboard atualiza em tempo real ✅

### Teste de alerta de fraude (R01):
1. Garanta pelo menos 1 pessoa contada como "dentro"
2. Não registre vendas por 15 minutos
3. Eduardo deve receber no Telegram:
   ```
   🚨 Alerta Olho Vivo
   Restaurante do Eduardo
   R01: X pessoas no salão sem vendas nos últimos 15 min.
   ```

---

## Passo 7 — Fazer o agente iniciar automaticamente com o Windows

Para que o agente suba sozinho quando o PC ligar:

1. Pressione `Win + R`, digite `shell:startup` e pressione Enter
2. Uma pasta do Explorer vai abrir
3. Crie um atalho para o `olhovivo-agent.exe` nessa pasta

Pronto — o agente vai iniciar automaticamente com o Windows.

---

## Problemas comuns

| Sintoma | O que verificar |
|---|---|
| Terminal abre e fecha rápido | Token errado em `token.txt`? Copie novamente do AdminPanel |
| Agente aparece Offline | Sem internet? Token correto? Aguardar 1 min e recarregar página |
| Câmera não descoberta | Câmera e PC na mesma rede? Adicionar manualmente com URL RTSP |
| Contagem não aparece no dashboard | Câmera aprovada no AdminPanel? |
| Telegram não recebe | Chat ID correto? Clicou em Salvar? Testar notificação funciona? |
| Alerta não disparado | Há venda registrada no período? |
| Windows Defender bloqueia o .exe | Clicar em "Mais informações" → "Executar assim mesmo" |

---

## Checklist de implantação

- [ ] Conta do Eduardo criada
- [ ] Telegram configurado e testado ✅
- [ ] Agente criado no AdminPanel → token copiado
- [ ] `olhovivo-agent.zip` baixado e extraído no PC do restaurante
- [ ] `token.txt` criado na pasta do agente com o token
- [ ] Agente executando → aparece **Online** no AdminPanel ✅
- [ ] Câmera na rede, descoberta e aprovada
- [ ] Teste de contagem: entrou/saiu nos logs ✅
- [ ] Teste de alerta R01: Telegram recebeu ✅
- [ ] Atalho de inicialização automática criado

---

## Para o desenvolvedor — gerar nova versão

```bash
# Na raiz do repositório
git tag agent-v0.2.0
git push origin agent-v0.2.0
```

O GitHub Actions vai compilar o `.exe` para Windows e Linux automaticamente e criar um Release com os downloads.

---

*Documento atualizado em mai/2026 — Olho Vivo Agent v0.1.0 · implantação Restaurante do Eduardo, Fortaleza/CE*

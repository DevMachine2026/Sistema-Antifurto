# Manual de Implantação — Restaurante Eduardo
**Sistema Olho Vivo · Dev Machine**

---

## Como funciona

```
[Câmera IP]──── rede local ────[PC do estabelecimento]
                                   │  olhovivo-agent (instalado via 1 comando)
                                   │  (conta pessoas com IA)
                            [Supabase → Dashboard]
                                   │
                          [Telegram do Eduardo]
```

---

## Pré-requisitos

| Item | Observação |
|---|---|
| **PC no restaurante** | Windows 10/11 ou Linux, com internet |
| **Câmera IP** | Qualquer câmera RTSP/ONVIF na mesma rede do PC |
| **Celular do Eduardo** | Para receber alertas no Telegram |

---

## Passo 1 — Criar a conta do restaurante

1. Acesse **https://sistema-antifurto.vercel.app**
2. **Criar conta** → nome do comércio, e-mail, senha → **Cadastrar**

---

## Passo 2 — Configurar Telegram

### 2a. Criar o bot
1. Telegram → `@BotFather` → `/newbot`
2. Nome: `Olho Vivo Restaurante` | Username: `olhovivo_eduardo_bot`
3. Anote o **token** retornado

### 2b. Descobrir o Chat ID
1. Abra o bot no Telegram e envie qualquer mensagem
2. Acesse: `https://api.telegram.org/botSEU_TOKEN/getUpdates`
3. Anote o número em `"chat": { "id": ... }`

### 2c. Configurar no sistema
1. **Configurações** → campo **Telegram Chat ID** → cole o número → **Salvar**
2. **Testar notificação** → Eduardo recebe no celular ✅

---

## Passo 3 — Criar o Agente

1. Menu **Agentes** → **Novo Agente**
2. Nome: `Restaurante do Eduardo` → **Criar**
3. No card criado, clique em **Instalar agente**

---

## Passo 4 — Instalar no PC do restaurante

Uma janela vai abrir com o comando de instalação. Escolha o sistema:

**Windows** — abra o **PowerShell como Administrador** e cole o comando mostrado na tela.

**Linux** — abra o **Terminal** e cole o comando mostrado na tela.

O comando faz tudo automaticamente:
- Baixa o agente
- Configura o token
- Configura inicialização automática com o sistema
- Inicia o agente

Em até 1 minuto o card do agente mostra **Online** ✅

---

## Passo 5 — Câmera e aprovação

1. Câmera conectada ao mesmo roteador do PC (cabo recomendado)
2. No AdminPanel → **Agentes** → card do restaurante → câmera aparece como candidata
3. Clique **Aprovar** → agente começa a contar automaticamente

> **Câmera não apareceu?** Adicione manualmente com a URL RTSP no card do agente.

| Fabricante | URL RTSP |
|---|---|
| Intelbras | `rtsp://admin:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0` |
| Hikvision | `rtsp://admin:SENHA@IP:554/Streaming/Channels/101` |
| Dahua | `rtsp://admin:SENHA@IP:554/cam/realmonitor?channel=1&subtype=0` |

---

## Passo 6 — Testar

**Contagem:** passar na frente da câmera → ver ENTROU/SAIU no card do agente

**Alerta R01:** deixar 1+ pessoa "dentro" por 15 min sem registrar venda → Eduardo recebe no Telegram

---

## Problemas comuns

| Sintoma | O que verificar |
|---|---|
| PowerShell bloqueou o comando | Executar como Administrador |
| Windows Defender bloqueou | Clicar "Mais informações" → "Executar assim mesmo" |
| Agente Offline após instalação | Sem internet? Aguardar 1 min e recarregar |
| Câmera não descoberta | Câmera e PC na mesma rede? Adicionar com URL RTSP |
| Telegram não recebe | Chat ID correto? Clicou em Salvar? |

---

## Checklist

- [ ] Conta criada
- [ ] Telegram testado ✅
- [ ] Agente criado no AdminPanel
- [ ] Comando de instalação executado no PC
- [ ] Agente **Online** ✅
- [ ] Câmera aprovada
- [ ] Teste de contagem OK
- [ ] Alerta R01 recebido no Telegram ✅

---

*Olho Vivo — Dev Machine · mai/2026*

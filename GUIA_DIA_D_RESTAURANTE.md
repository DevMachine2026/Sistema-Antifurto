# Guia Dia D — Implantação Restaurante Eduardo
**Olho Vivo · Dev Machine**

---

## Antes de ligar para o Eduardo

- [ ] Abrir o painel em **https://sistema-antifurto.vercel.app**
- [ ] Ir em menu **Implantação** (ícone 🚀 na barra lateral)
- [ ] Confirmar que o agente já está criado (aba Agentes → Restaurante Eduardo)
- [ ] Se não existir: **Agentes → Novo Agente** → nome: `Restaurante Eduardo`

> A partir daí, a página de **Implantação** guia tudo com 3 passos e confirma cada etapa automaticamente.

---

## Passo 1 — Telegram (1 min)

**Na página Implantação → Passo 1:**

1. Copiar o link exibido (começa com `t.me/sistemantifraude_bot?start=...`)
2. Enviar para o Eduardo por WhatsApp
3. Eduardo abre o link no celular → clica **Iniciar**
4. Passo 1 fica verde automaticamente ✅

> Sem @BotFather. Sem Chat ID. O sistema faz tudo.

---

## Passo 2 — Instalar o agente (3 min)

**Na página Implantação → Passo 2:**

1. Selecionar **Windows** (ou Linux)
2. Clicar em **Baixar instalador para Windows** → arquivo `.ps1` é baixado
3. Enviar o arquivo `.ps1` para o Eduardo por WhatsApp ou e-mail
4. Eduardo: **botão direito no arquivo → "Executar com PowerShell"** → **Sim**
5. Aguardar mensagem "instalado com sucesso"
6. Passo 2 fica verde automaticamente (em até 1 min) ✅

> Se o Windows Defender bloquear: clicar **Mais informações** → **Executar assim mesmo**

---

## Passo 3 — Câmera (1 min)

**Na página Implantação → Passo 3:**

1. Aguardar câmera aparecer como candidata (o agente descobre sozinho)
2. Clicar **Aprovar** — você faz isso, Eduardo não precisa fazer nada
3. Passo 3 fica verde automaticamente ✅

> **Câmera não apareceu após 2 min?**
> - Câmera e PC estão no mesmo roteador?
> - Adicionar manualmente em **Agentes → card do agente → URL RTSP**

---

## Teste final

- [ ] Eduardo passa na frente da câmera → contagem sobe no Dashboard
- [ ] Aguardar 15 min sem vendas com pessoas dentro → alerta R01 chega no Telegram
- [ ] Eduardo confirma que recebeu a notificação ✅

---

## Se der errado

| Problema | O que fazer |
|---|---|
| Eduardo não recebeu mensagem no Telegram | Gerar novo link em Configurações → Regenerar token → repetir Passo 1 |
| Windows Defender bloqueou | Clique "Mais informações" → "Executar assim mesmo" |
| Agente não fica Online | Verificar internet. Reenviar e executar o .ps1 novamente |
| Câmera não descoberta | Câmera e PC no mesmo roteador? Adicionar URL RTSP manualmente |

---

## Checklist final

- [ ] Passo 1 verde: Telegram conectado ✅
- [ ] Passo 2 verde: Agente Online ✅
- [ ] Passo 3 verde: Câmera aprovada ✅
- [ ] Alerta R01 recebido no Telegram ✅

---

*Olho Vivo — Dev Machine · mai/2026*

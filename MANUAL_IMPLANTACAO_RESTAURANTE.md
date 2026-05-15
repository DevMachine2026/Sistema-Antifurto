# Manual de implantação — Agente Olho Vivo (restaurante)

Guia para **dono de estabelecimento** ou **quem instala o PC** no local. O foco é **Windows**: instalação em poucos cliques, **sem** extrair ZIP, **sem** criar `token.txt` e **sem** abrir terminal.

---

## O que é o agente

O **Olho Vivo Agente** é um programa que roda num **computador Windows** no restaurante (ou bar, evento, etc.). Ele:

- lê as câmeras pela rede (RTSP);
- conta pessoas com inteligência artificial (YOLOv8);
- envia os números de forma segura para a plataforma Olho Vivo;
- ajuda a descobrir câmeras na rede (ONVIF).

Você **não** precisa instalar Python nem Docker.

---

## Antes de começar

| Item | Detalhe |
|------|---------|
| **Sistema** | Windows 10 ou 11 (64 bits); o instalador padrão **não** exige conta de administrador |
| **Rede** | PC na mesma rede das câmeras; internet estável para falar com a plataforma |
| **Conta** | Alguém com acesso ao painel Olho Vivo já deve ter **criado o agente** e gerado o link de instalação (área **Agentes** ou fluxo de **onboarding**) |

---

## Instalação no Windows (recomendado)

### Passo 1 — Baixar pelo painel

1. Abra o link de instalação que o administrador enviou **ou** entre no painel → **Agentes** → use a opção de instalar / copiar link.
2. O navegador vai baixar um arquivo com nome parecido com:

   `OlhoVivoSetup_TOKEN_xxxxxxxx.exe`

   O trecho depois de `TOKEN_` é o código do **seu** agente. **Não renomeie** o arquivo e **não** precisa abrir esse código: o instalador usa o nome sozinho.

### Passo 2 — Rodar o instalador

1. Abra a pasta **Downloads** (ou onde o arquivo foi salvo).
2. Dê **dois cliques** no instalador.
3. Avance nas telas (**Avançar** / **Next**) até concluir. (Em instalações padrão **não** é necessário ser administrador.)

O programa será instalado na pasta do seu usuário, em geral:

`%LocalAppData%\Programs\Olho Vivo\`

(Exemplo: `C:\Users\SeuNome\AppData\Local\Programs\Olho Vivo\`.)

Ao terminar, o agente **inicia sozinho** e fica configurado para **abrir de novo quando o Windows ligar**.

### Passo 3 — No painel (quem administra)

1. Confira se o agente aparece como **Online** (pode levar um minuto após a primeira execução).
2. Quando aparecerem câmeras descobertas, **aprove** as que forem usar para contagem, no painel.

Até aqui, o dono do restaurante **não vê nem digita** o token: ele vem embutido no nome do instalador e é guardado automaticamente pelo sistema.

---

---

## Aba Câmeras — como funciona

A aba **Câmeras** (menu lateral) é onde o dono do estabelecimento gerencia todas as câmeras cadastradas na plataforma. Ela é diferente da aba **Agentes**: enquanto o agente *descobre* câmeras automaticamente na rede, a aba Câmeras permite *cadastrar manualmente* e visualizar o stream ao vivo.

### O que aparece na tela

Cada câmera cadastrada mostra um cartão com:

| Campo | O que é |
|---|---|
| **Preview ao vivo** | Thumbnail do stream em tempo real (clique para tela cheia) |
| **Status** | 🟢 Online / 🔴 Offline / 🟡 Configurando |
| **Marca** | Intelbras, Hikvision, Dahua ou Genérica |
| **Tipo** | Contagem de pessoas ou Câmera do caixa |
| **IP** | Endereço e porta da câmera na rede local |
| **Último evento** | Data/hora do último evento recebido |

### Adicionar câmera manualmente (wizard em 5 etapas)

Clique em **+ Adicionar câmera** para abrir o assistente:

**Etapa 1 — Marca**
Escolha a marca da câmera. Isso define as instruções de configuração corretas para o firmware.

**Etapa 2 — IP**
Digite o IP da câmera (ex: `192.168.1.100`) e a porta (padrão: `554` para RTSP, `80` para HTTP).
Ou use a **varredura de rede automática** — o painel detecta câmeras na mesma sub-rede e lista os IPs encontrados.

**Etapa 3 — Nome e tipo**
- Dê um nome para identificar a câmera (ex: "Entrada principal")
- Escolha o tipo: **Contagem de pessoas** (conta entradas e saídas) ou **Câmera do caixa** (detecta espécie — regra R05)

**Etapa 4 — Configurar**
O painel mostra o passo a passo específico para a marca escolhida: como acessar o firmware da câmera, onde colar a **URL de webhook** e o **token de autenticação** para que a câmera envie eventos ao sistema.

**Etapa 5 — Testar**
O painel tenta conectar na câmera e exibe se o stream está funcionando.

### Câmeras via Agente Olho Vivo (automático)

Quando o agente está instalado no PC do estabelecimento, ele faz a **descoberta automática** das câmeras na rede local (ONVIF + varredura de portas). As câmeras encontradas aparecem na aba **Agentes** para aprovação — após aprovadas, ficam disponíveis automaticamente para contagem, sem precisar usar o wizard acima.

### DVRs (gravadores digitais)

O agente também detecta **DVRs** automaticamente. Quando um DVR é encontrado, ele aparece na aba **Agentes** com a indicação "DVR" e o número de canais detectados. Para aprovar:

1. Clique em **Configurar DVR** no cartão do dispositivo.
2. Confirme (ou corrija) o **usuário**, a **senha** e a **quantidade de canais**.
3. Clique em **Aprovar** — o sistema cria uma câmera por canal automaticamente.

As credenciais do DVR são preenchidas automaticamente quando o agente conseguiu testá-las durante a varredura. Se aparecerem em branco, preencha manualmente.

### Tela cheia

Clique em qualquer preview de câmera para abrir em tela cheia (funciona no celular também).

### Remover câmera

Cada cartão tem o botão **Remover câmera** (vermelho). A remoção é imediata — o stream para de ser monitorado.

---

## Onde ficam logs e dados locais

Em máquinas Windows com instalação padrão, o agente grava arquivos de trabalho em:

`%LOCALAPPDATA%\OlhoVivoAgent\`

(Em português do Windows: em geral `C:\Users\SEU_USUARIO\AppData\Local\OlhoVivoAgent\`.)

| Arquivo / pasta | Função |
|-----------------|--------|
| `agente.log` | Registro do que o agente está fazendo (útil para suporte) |
| `.olhovivo.env` | Configuração interna com o token (não é preciso editar) |
| `queue.db` | Fila temporária se a internet cair um pouco |

**Não apague** esses arquivos sem orientação do suporte.

---

## Desinstalar

1. **Configurações do Windows** → **Aplicativos** → **Aplicativos instalados**.
2. Procure **Olho Vivo Agente** (ou nome parecido) e desinstale.

Isso remove a pasta do aplicativo em `AppData\Local\Programs\Olho Vivo`. A pasta `AppData\Local\OlhoVivoAgent` (logs e fila) pode permanecer; você pode apagá-la manualmente se quiser zerar dados locais antigos.

---

## Problemas comuns

| Situação | O que fazer |
|----------|-------------|
| Instalador diz que falta `TOKEN_` no nome | Baixe de novo pelo **link do painel**. Não use só o `OlhoVivoSetup.exe` genérico do GitHub sem o nome completo. |
| Agente não fica Online | Internet, firewall do Windows ou antivírus bloqueando saída para a internet; verifique `agente.log` na pasta acima. |
| `agente.log` mostra `401 Unauthorized` | A `SUPABASE_ANON_KEY` não está configurada no agente. Em ambiente dev: defina a variável de ambiente (veja README). No instalador Windows gerado pelo painel, isso já vem embutido. |
| Câmeras não aparecem | Rede: PC e câmeras na mesma LAN; credenciais RTSP configuradas no painel após aprovação. |
| DVR aparece mas sem canais | O agente não conseguiu detectar os canais automaticamente. Clique em **Configurar DVR**, preencha usuário, senha e número de canais manualmente e aprove. |
| DVR aprovado mas câmeras não contam | O DVR foi cadastrado, mas o agente precisa de câmeras com fluxo RTSP ativo. Confirme que os canais estão ativos no firmware do DVR. |

---

## Linux ou ambiente de desenvolvimento

Para **Linux** ou testes com código-fonte, o fluxo é outro. Variáveis necessárias:

```bash
export ESTABLISHMENT_TOKEN="uuid-do-agente"
export SUPABASE_ANON_KEY="sua_anon_key_aqui"   # obrigatória — chave anon/public do Supabase
export SUPABASE_URL="https://SEU_REF.supabase.co"  # opcional
```

Sem a `SUPABASE_ANON_KEY`, todos os requests ao Supabase retornam **401 Unauthorized**. O valor fica em **Project Settings → API** no painel do Supabase.

Alternativamente, use o arquivo `token.txt` para o token e coloque `SUPABASE_ANON_KEY` no `.env` ao lado do `main.py`, conforme documentado em `agent/main.py` e `.env.example`. O instalador Inno descrito acima é **só para Windows**.

---

## Referências técnicas no repositório

- `README.md` — visão geral; release automático na tag `agent-v*` via `.github/workflows/agent-release.yml`.
- `agent/main.py` — ordem de leitura do token, logs e autostart.
- `agent/olhovivo-setup.iss` — script do instalador Inno Setup.

---

---

## Para o administrador da plataforma (platform_admin)

### Registrar o bot Telegram (uma vez por deploy)

Após fazer o deploy da função `telegram-connect` no Supabase, é preciso registrá-la como webhook do bot `@sistemantifraude_bot` na API do Telegram. Isso é feito **uma única vez** (ou após cada redeploy da função):

1. Acesse o painel com uma conta `platform_admin`.
2. No **Painel Administrativo**, role até a seção **Bot Telegram**.
3. Clique em **Registrar Webhook**.
4. Aguarde a confirmação "Webhook registrado com sucesso".

A partir daí, quando qualquer comerciante acessar **Configurações → Conectar Telegram** e clicar no link gerado, o chat_id dele será registrado automaticamente.

---

**Olho Vivo** — manual alinhado ao instalador em um clique (Windows).

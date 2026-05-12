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

**Olho Vivo** — manual alinhado ao instalador em um clique (Windows).

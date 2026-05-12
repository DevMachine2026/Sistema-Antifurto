# Olho Vivo — Propósito do Produto e Desafio de Integração

## O que é o Olho Vivo

O Olho Vivo é um sistema antifraude para estabelecimentos comerciais — restaurantes, bares, casas de eventos, varejo — que cruza automaticamente três fontes de dados para detectar desvios financeiros:

- **Câmeras IP** — contagem de pessoas entrando e saindo do estabelecimento, 24h por dia, via visão computacional (YOLOv8)
- **Sistema de vendas** (ST Ingressos) — total de vendas registradas
- **Pagamentos** (PagBank) — total de pagamentos processados

Quando o sistema identifica inconsistências entre essas fontes — por exemplo, muitas pessoas dentro do estabelecimento e vendas zeradas, ou gap entre o que foi vendido e o que foi recebido — ele emite um alerta via Telegram ou WhatsApp para o dono.

O objetivo é dar ao dono do estabelecimento visibilidade em tempo real sobre o que acontece no seu negócio, sem depender de auditoria manual.

---

## Arquitetura

```
[Câmera IP]──RTSP──▶[Agente Python no PC do cliente]──▶[Supabase]◀──[Painel Web]
                          (conta pessoas com YOLO)       (motor de regras,    (dashboard,
                          (heartbeat a cada 30s)          alertas, dados)      alertas,
                                                                               agentes)
                    [CSV PagBank / ST Ingressos]──upload──▶[Supabase]
```

**Stack:**
- Frontend: React 19 + TypeScript + Vite + TailwindCSS, hospedado na Vercel
- Backend: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- Agente edge: Python 3.11 + YOLOv8-nano (ONNX Runtime) + OpenCV, distribuído como `.exe` Windows via PyInstaller + GitHub Actions

**Distribuição do agente (atual — Windows):**
PyInstaller (`console=False`, pasta `onedir`) + **Inno Setup** (`agent/olhovivo-setup.iss`). O GitHub Actions, em tag `agent-v*`, publica **`OlhoVivoSetup.exe`**. O painel força o download com nome `OlhoVivoSetup_TOKEN_<uuid>.exe`; o token não passa pela mão do cliente. Ver `README.md` e `MANUAL_IMPLANTACAO_RESTAURANTE.md`.

**Distribuição legada (histórico):** a seção *Lições do fluxo legado* descreve o antigo par ZIP + `token.txt` — mantida como registro do problema de produto.

---

## Fluxo de implantação (como deveria funcionar)

1. Admin (RonalDigital) cria um "agente" no painel para o estabelecimento do cliente → sistema gera um token UUID único no Supabase
2. Admin copia um link de instalação e manda pro cliente via WhatsApp
3. Cliente abre o link → recebe o instalador → executa → agente sobe, descobre as câmeras e aparece online no painel
4. Admin aprova as câmeras descobertas pelo ONVIF
5. Sistema começa a monitorar

---

## Lições do fluxo legado (ZIP + token manual)

### Contexto

O cliente típico do Olho Vivo é o **dono de um restaurante ou bar** que não tem qualificação técnica. Não sabe o que é um arquivo ZIP, não sabe extrair arquivos, não distingue uma pasta de um arquivo, não sabe o que é um terminal ou console. Para ele, "instalar" significa clicar em "Avançar, Avançar, Concluir" em um instalador com janelas coloridas.

### O que havia no fluxo antigo (substituído)

O fluxo **antigo** entregava **dois arquivos separados** ao cliente:

1. `olhovivo-agent-windows.zip` — baixado direto do GitHub Releases
2. `token.txt` — gerado no browser via Blob e baixado junto

E instrui o cliente a fazer:

> 1. Abra a pasta Downloads
> 2. **Extraia** o olhovivo-agent-windows.zip
> 3. **Copie** o token.txt para **dentro** da pasta olhovivo-agent
> 4. Dê duplo clique em olhovivo-agent.exe

### Por que isso falha sistematicamente

**Falha 1 — Dois downloads simultâneos**
O browser frequentemente bloqueia o segundo download como popup. O cliente fica com apenas um dos arquivos, sem saber o que aconteceu ou o que está faltando.

**Falha 2 — Extração do ZIP**
Leigos tentam abrir o `.exe` diretamente de dentro do arquivo ZIP sem extrair. O Windows permite abrir o explorador dentro do ZIP, dando a impressão de que a extração não é necessária. O executável é iniciado mas imediatamente falha porque os arquivos de suporte (DLLs, modelo ONNX) não estão acessíveis — e o erro não é claro.

**Falha 3 — Mover o token.txt para o lugar certo**
Este é o passo mais crítico e mais propenso a erro. O cliente precisa:
- Saber o que é um arquivo `.txt`
- Saber onde o ZIP foi extraído
- Navegar até a subpasta correta dentro do ZIP extraído
- Copiar (não mover, ou mover — tanto faz, mas ele não sabe) o arquivo para lá

Cada um desses micro-passos é uma barreira para alguém sem familiaridade com o sistema de arquivos do Windows.

**Falha 4 — Janela preta (console)** *(mitigada no build atual: PyInstaller sem console; logs em arquivo)*
No fluxo antigo o agente rodava como aplicação de console — uma janela preta com logs. Leigos fecham janelas pretas achando que o processo terminou ou que é um vírus. O agente morria.

**Falha 5 — Nenhuma persistência no boot** *(mitigada no build atual: registro em `Run` + agente reforça HKCU ao iniciar)*
Quando o computador do cliente reiniciava, o agente antigo não subia automaticamente. O monitoramento parava silenciosamente.

### O que já foi tentado

**Tentativa 1 — ZIP + token.txt (legado)**
Descrito acima. Falha nos passos de extração e cópia do token.

**Tentativa 2 — `.bat` auto-instalador (rejeitada antes de testar)**
O Cursor (ferramenta de IA) propôs gerar um único arquivo `.bat` no browser com o token embutido. O `.bat` baixaria o ZIP, extrairia, escreveria o `token.txt` automaticamente e abriria o agente. A tentativa foi descartada porque as mudanças foram feitas sem autorização prévia, não por problema técnico na abordagem.

### Implementação atual (Windows)

Instalador único **`OlhoVivoSetup.exe`** com token no nome do arquivo (`TOKEN_`), Inno Setup, agente sem janela de console, autostart e logs em `%LOCALAPPDATA%\OlhoVivoAgent\`. Detalhes técnicos: `README.md`, `MANUAL_IMPLANTACAO_RESTAURANTE.md`, `agent/`.

### O que ainda pode evoluir

Melhorias de produto (feedback visual “instalado com sucesso”, métricas de falha de download, Linux com paridade, etc.) continuam válidas além do instalador Windows.

---

## Critérios de sucesso para a integração

- [x] **1 arquivo** entregue ao cliente (Windows: um `.exe` de instalador pelo link do painel)
- [x] **0 passos de configuração manual** de token para o leigo (sem ZIP + token.txt no fluxo principal)
- [x] **Token invisível** para o cliente — embutido no nome do instalador / persistido pelo agente
- [x] **Agente persiste no boot** (registro Windows)
- [ ] **Feedback visual claro** — “Instalado com sucesso” dedicado (além do assistente Inno)
- [ ] **Admin vê online no painel** em até 2 minutos (depende de rede e firewall; validar em campo)

---

*Documento criado em mai/2026 — RonalDigital — atualizado com fluxo Inno + PyInstaller.*

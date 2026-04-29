# Guia de Uso - Sistema Antifraude (1 Bar)

Guia operacional atualizado para uso diario do sistema em um unico estabelecimento.

---

## 1) O que o sistema monitora

O sistema cruza quatro fontes:

1. **Contagem de pessoas** (camera de entrada)
2. **Eventos de especie** (camera no caixa)
3. **Transacoes financeiras** (PagBank)
4. **Vendas registradas** (ST Ingressos)

Com isso, gera alertas automaticos quando encontra inconsistencias.

---

## 2) Alertas ativos

- **R01 - Salao cheio sem vendas**
  - dispara quando ha muita gente e nenhuma venda no periodo configurado
- **R02 - Gap financeiro**
  - dispara quando PagBank e ST Ingressos divergem acima do threshold
- **R05 - Cash ghost**
  - dispara quando a camera detecta especie e nao ha venda cash correspondente

---

## 3) Notificacoes (estado atual)

- **Telegram automatico**
  - envio via Edge Function `send-telegram`
  - token do bot fica em **Supabase Secret** (`TELEGRAM_BOT_TOKEN`)
  - token nao fica mais no frontend
- **WhatsApp**
  - push no navegador + deep link para mensagem pronta

---

## 4) Uso diario (rotina simples)

1. Abrir **Dashboard** e conferir se ha picos anormais.
2. Abrir **Alertas** e tratar os itens criticos primeiro.
3. Ao investigar, marcar alerta como resolvido.
4. Conferir **Audit Trail** para historico de acoes.
5. Em fechamento de caixa, importar CSV/PDF se necessario.

---

## 5) Configuracoes essenciais

Em `Configuracoes`:

- `r01_min_people`
- `r01_window_minutes`
- `r02_gap_threshold`
- `telegram_chat_id`
- `whatsapp_number`

Obs: o sistema esta configurado para 1 bar via `VITE_ESTABLISHMENT_ID`.

---

## 6) Checklist rapido de operacao

- Webhooks recebendo normalmente
- Alertas aparecendo no dashboard
- Resolucao de alertas funcionando
- Telegram teste funcionando
- Audit trail registrando eventos

# Como instalar a câmera no estabelecimento

Este guia explica como deixar o computador do estabelecimento enviando dados de câmera para o Olho Vivo automaticamente.

---

## O que você vai precisar

- O computador do estabelecimento (Windows ou Linux)
- Uma webcam USB (qualquer modelo básico serve)
- Acesso à internet

---

## Passo 1 — Instalar o Python

O Python é o programa que faz a câmera funcionar com o Olho Vivo.

1. Acesse: **python.org/downloads**
2. Clique no botão de download (versão 3.12 ou mais recente)
3. Abra o arquivo baixado
4. **Importante:** marque a opção **"Add Python to PATH"** antes de clicar em instalar
5. Clique em **Install Now** e aguarde

---

## Passo 2 — Copiar o script

1. Copie o arquivo `webcam_test.py` (que está na pasta `scripts/`) para o computador do estabelecimento
   - Pode usar um pendrive, ou enviar por WhatsApp/email
2. Salve em um lugar fácil de encontrar, por exemplo: **Área de trabalho**

---

## Passo 3 — Configurar o script

Abra o arquivo `webcam_test.py` com o **Bloco de Notas** e localize as duas linhas que precisam ser preenchidas:

```
WEBHOOK_URL = "COLE_AQUI_A_URL_DO_WEBHOOK"
WEBHOOK_TOKEN = "COLE_AQUI_O_TOKEN"
```

Substitua pelos valores do estabelecimento. Você encontra esses valores na tela de **Integrações** dentro do Olho Vivo.

Salve o arquivo após editar.

---

## Passo 4 — Instalar as dependências

As dependências são programas extras que o script precisa para funcionar.

1. Abra o **Prompt de Comando** (no Windows: pressione `Windows + R`, digite `cmd` e pressione Enter)
2. Digite o comando abaixo e pressione Enter:

```
pip install opencv-python requests
```

3. Aguarde a instalação terminar (pode levar alguns minutos)

---

## Passo 5 — Conectar a webcam e rodar

1. Conecte a webcam USB no computador
2. Abra o **Prompt de Comando** na pasta onde salvou o script
3. Digite:

```
python webcam_test.py
```

4. Uma janela vai abrir mostrando a imagem da câmera em tempo real
5. Quando detectar pessoas, os dados são enviados automaticamente para o Olho Vivo

**Controles:**
- Pressione **S** para enviar uma leitura agora
- Pressione **Q** para encerrar o programa

---

## Como deixar rodando automaticamente

Para que o script inicie sozinho toda vez que o computador ligar:

**No Windows:**
1. Pressione `Windows + R`, digite `shell:startup` e pressione Enter
2. Crie um atalho do arquivo `webcam_test.py` nessa pasta
3. Pronto — a câmera vai iniciar automaticamente com o Windows

---

## Dúvidas comuns

**A janela da câmera abriu mas não detecta ninguém**
- Verifique se a câmera está apontada para a entrada/salão
- O script detecta melhor quando as pessoas estão de corpo inteiro no enquadramento

**Apareceu um erro vermelho ao rodar**
- Verifique se o Python foi instalado corretamente (Passo 1)
- Verifique se rodou o comando de instalação das dependências (Passo 4)

**Os dados não aparecem no Dashboard**
- Confirme se a URL e o Token no script estão corretos (Passo 3)
- Verifique se o computador está conectado à internet

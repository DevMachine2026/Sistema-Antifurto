# 🛡️ Guia do Sistema Antifraude para Bares

Este guia explica, de forma simples e direta, como o seu sistema monitora o bar e garante que cada cliente que entra esteja consumindo corretamente.

---

## 1. O que o sistema faz?
O sistema funciona como um "Auditor Digital" que nunca dorme. Ele cruza três informações principais para saber se algo está errado:
1.  **Câmeras Inteligentes:** Contam quantas pessoas estão no salão.
2.  **Maquinetas (PagBank):** Informam quanto dinheiro de fato entrou.
3.  **Sistema de Consumo:** Informa quais pedidos foram lançados.

---

## 2. Como as Integrações Funcionam (Passo a Passo)

### 📸 Câmeras (Contagem de Pessoas)
*   **A Instalação:** Uma câmera é colocada na entrada/saída do bar.
*   **A Tecnologia:** Ela usa Inteligência Artificial para identificar formas humanas (não grava rostos, apenas conta vultos).
*   **O Envio:** A cada 30 minutos, a câmera envia para o dashboard o número total de pessoas dentro do estabelecimento.

### 💳 Maquinetas (PagBank/Cartão)
*   **O Registro:** Cada vez que um cliente passa o cartão, a transação é processada.
*   **A Auditoria:** O sistema importa (via CSV ou API) os valores vendidos.
*   **O Cruzamento:** O sistema verifica se o valor que caiu na maquineta bate com o valor que o garçom lançou no sistema de pedidos.

### 🧾 Sistemas de Pedidos (ST Ingressos/Outros)
*   Integrado para saber quais produtos foram vendidos (cervejas, petiscos, etc).

---

## 3. Identificando Ações Estranhas (Alertas)

O sistema dispara alertas automáticos em dois casos principais:

### 🚩 Alerta R01: "Salão Cheio, Caixa Vazio"
*   **O que acontece:** A câmera detecta que o bar está com 50 pessoas, mas nos últimos 30 minutos não houve nenhum lançamento de pedido no sistema.
*   **O que significa:** Pode estar ocorrendo consumo sem registro, entrada sem controle ou falha no lançamento dos garçons.

### 🚩 Alerta R02: "Gap Financeiro"
*   **O que acontece:** O relatório da maquineta (PagBank) diz que entrou R$ 1.000,00, mas o seu sistema de pedidos diz que só foi vendido R$ 800,00.
*   **O que significa:** Alguém pode estar passando valores na maquineta que não correspondem aos pedidos lançados (possível desvio ou erro humano grave).

---

## 4. Dinâmica das Notificações (WhatsApp)

Você não precisa ficar olhando para o computador o tempo todo. 
1.  Quando um erro grave ocorre, o navegador dispara uma **Notificação Push** no seu celular ou computador.
2.  Ao clicar, você pode abrir o **WhatsApp** com uma mensagem pronta para cobrar o gerente ou a equipe de segurança.
3.  O número cadastrado (atualmente o seu: **85 99199-3833**) recebe a informação em tempo real.

---

## 5. Como Usar no Dia a Dia?

1.  **Dashboard:** Olhe o gráfico principal. Se a linha azul (vendas) estiver muito abaixo da linha tracejada (pessoas), há um problema de conversão ou fraude.
2.  **Audit Center:** Verifique a lista de alertas. Cada alerta resolvido deve ser marcado como "Auditado" para manter o histórico.
3.  **Central de Ingestão:** No final da noite (ou a cada 2 horas), suba o arquivo CSV da sua maquineta para que o sistema valide as contas automaticamente.

---

**Dúvidas?** O sistema foi desenhado para ser autoexplicativo, priorizando cores (Vermelho = Crítico, Verde = OK) para facilitar sua tomada de decisão rápida.

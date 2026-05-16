# O que é o YOLO — e por que não usamos ChatGPT

## O problema que precisamos resolver

A câmera grava um vídeo contínuo. Precisamos saber, a cada segundo, se tem uma pessoa
passando pela porta. Não queremos o vídeo inteiro — só a resposta: *"passou alguém?
Em que direção?"*

---

## Existem dois tipos de IA completamente diferentes

### Tipo 1 — IA de linguagem (ChatGPT, Claude, Gemini)

Treinada para entender e gerar **texto**. Você escreve uma pergunta, ela responde.

- Entrada: texto
- Saída: texto
- Onde roda: servidores na nuvem (Anthropic, OpenAI)
- Velocidade: 1–5 segundos por resposta
- Custo: por token (cobrança por uso)

### Tipo 2 — IA de visão computacional (YOLO)

Treinada para identificar **objetos em imagens**. Você dá uma foto, ela responde
quais objetos estão ali e onde estão.

- Entrada: imagem ou frame de vídeo
- Saída: lista de objetos detectados com coordenadas
- Onde roda: direto no computador do cliente (CPU)
- Velocidade: 30–100ms por frame (tempo real)
- Custo: zero por uso (modelo já instalado)

---

## O que é o YOLO especificamente

**YOLO** = *You Only Look Once* (você só olha uma vez).

É um modelo de detecção de objetos criado em 2016 e constantemente evoluído.
A versão que usamos é a **YOLOv8 nano** — a menor e mais rápida da família.

O nome vem de como ele funciona: ao contrário de sistemas antigos que analisavam
a imagem em múltiplas passagens, o YOLO analisa a imagem **inteira de uma vez**
e já retorna todas as detecções. Por isso é rápido o suficiente para vídeo ao vivo.

**O que ele consegue detectar:** foi treinado em 80 categorias de objetos —
pessoas, carros, cadeiras, celulares, animais etc. No nosso sistema, usamos
só a categoria **"person"** (pessoa).

**O que ele entrega para o nosso sistema:**

```
Frame de vídeo → YOLO → [
  { objeto: "person", confiança: 87%, posição: x=120, y=340, largura=60, altura=180 },
  { objeto: "person", confiança: 92%, posição: x=300, y=280, largura=55, altura=190 },
]
```

Com essas coordenadas, o nosso rastreador sabe onde cada pessoa está e, quando
ela cruza a linha virtual na porta, conta como entrada ou saída.

---

## Por que não usamos ChatGPT ou outro LLM para isso?

Três razões técnicas e uma de negócio:

### 1. Velocidade — impossível em tempo real

O sistema analisa 5 frames por segundo por câmera.
ChatGPT leva 1–5 segundos para responder **uma** pergunta.
Para processar 5 frames/segundo, precisaríamos de 5–25 requisições por segundo
— isso resultaria em atraso de minutos, não detecção em tempo real.

### 2. Custo — inviável em escala

Enviar uma imagem de câmera para uma API de IA (GPT-4 Vision, por exemplo) custa
entre R$ 0,05 e R$ 0,20 por imagem. Com 5 frames/segundo, 8 horas de operação:

```
5 frames/s × 3.600s/h × 8h × R$ 0,10 = R$ 14.400 por câmera por dia
```

Com YOLO rodando local: **R$ 0,00 por uso**.

### 3. Problema errado — LLM não é bom em coordenadas precisas

ChatGPT é excelente para interpretar texto e raciocinar. Mas para localizar
exatamente onde uma pessoa está em pixels e rastrear ela frame a frame com
consistência de milissegundos, um modelo especializado em visão é muito
mais preciso e confiável.

### 4. Privacidade — vídeo nunca sai do estabelecimento

Com YOLO rodando no computador local do cliente, **nenhuma imagem é enviada
para a internet**. O que vai para o servidor é só o número:
`{ pessoas_dentro: 23 }`. Isso é um requisito legal e de confiança do cliente.

---

## Como o YOLO chega ao computador do cliente

O modelo YOLO é um arquivo chamado `yolov8n.onnx` (cerca de 6 MB).
Esse arquivo é **embutido dentro do instalador** do agente
(`OlhoVivoSetup_TOKEN_xxx.exe`) que o cliente baixa do painel.

Quando o agente inicia:
1. Carrega o arquivo `yolov8n.onnx` da memória
2. Abre a câmera via RTSP
3. A cada 5 frames, passa o frame pelo YOLO
4. Recebe as coordenadas das pessoas detectadas
5. Aplica o rastreador (SORT + Kalman) para saber quem é quem
6. Detecta cruzamento de linha → envia contagem para o servidor

Tudo isso acontece no computador do restaurante, sem internet para o processamento.

---

## Resumo em uma linha

> ChatGPT lê e escreve texto. YOLO enxerga objetos em imagens.
> São ferramentas para problemas completamente diferentes.
> Para contar pessoas em vídeo ao vivo, YOLO é a escolha certa —
> é rápido, gratuito por uso, roda offline e não expõe as imagens.

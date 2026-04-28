import ReactMarkdown from 'react-markdown';
import { BookOpen, ChevronRight, HelpCircle } from 'lucide-react';

const guideContent = `# Guia do Sistema Antifraude

Este guia explica como o sistema monitora o estabelecimento e garante a integridade da operação.

---

## 1. O que o sistema faz?

O sistema funciona como um **Auditor Digital 24/7**. Ele cruza quatro fontes de dados em tempo real:

1. **Câmera na entrada** — Conta quantas pessoas estão no salão (Intelbras ISAPI)
2. **Câmera no caixa** — Detecta pagamentos em dinheiro (Raspberry Pi + OpenCV)
3. **Maquinetas (PagBank)** — Confirma o dinheiro que entrou via cartão/PIX
4. **Sistema de Consumo (ST Ingressos)** — Registra os pedidos lançados

Todos os dados são armazenados em banco de dados seguro e auditável.

---

## 2. Como as Integrações Funcionam

### Câmera de Contagem (Entrada)
A câmera Intelbras envia automaticamente a contagem de pessoas via webhook ISAPI. O sistema recebe e atualiza o dashboard em tempo real — sem intervenção manual.

### Câmera no Caixa (Detecção de Espécie)
Um Raspberry Pi conectado à câmera do caixa identifica quando um cliente apresenta cédulas. O evento é registrado com data e hora para cruzamento com os lançamentos do ST Ingressos.

### Maquinetas (PagBank)
Importe o extrato CSV na aba **Importar Dados** ou conecte via webhook para recebimento automático por venda.

### Sistema de Pedidos (ST Ingressos)
Importe o relatório PDF de fechamento ou receba vendas em tempo real via webhook. O motor de regras cruza os dados instantaneamente.

---

## 3. Alertas Automáticos

### R01 — "Salão Cheio, Caixa Vazio"
- **Cenário:** Mais de 30 pessoas no bar, mas zero vendas nos últimos 30 minutos
- **Risco:** Consumo sem registro, venda sem lançamento ou falha do sistema de pedidos

### R02 — "Gap Financeiro"
- **Cenário:** Valor na maquineta difere do ST Ingressos por mais de R$ 200
- **Risco:** Desvio de valores, cancelamentos abusivos ou erro operacional grave

### R05 — "Cash Ghost" (Espécie Fantasma)
- **Cenário:** Câmera detecta pagamento em dinheiro mas o ST Ingressos não registra venda em espécie no mesmo período
- **Risco:** Operador recebe o dinheiro e não lança a venda — desvio direto de caixa

---

## 4. Notificações

Quando um alerta crítico é gerado, o sistema dispara **dois canais simultaneamente**:

### Telegram (automático)
- A mensagem chega **instantaneamente** no celular do responsável
- Não requer nenhuma interação — funciona com o celular bloqueado
- Configure em **Configurações → Telegram**

### WhatsApp (manual)
- O navegador exibe uma notificação push
- Ao clicar, abre o WhatsApp com a mensagem já formatada
- Requer que o navegador esteja aberto

---

## 5. Integrações e Webhooks

A aba **Integrações** centraliza todas as conexões externas:

- **Token de autenticação** — Usado por câmeras e Raspberry Pi para enviar dados com segurança
- **Câmera contagem** — Status e endpoint para a Intelbras CAM 1200
- **Detecção de espécie** — Status e payload esperado do Raspberry Pi
- **ST Ingressos API** — Endpoint para recebimento de vendas em tempo real

Cada integração mostra o status (Ativo / Aguardando), o último evento recebido e a documentação do payload.

---

## 6. Simulador de Demo

A aba **Simulador Demo** testa o sistema de ponta a ponta sem hardware real:

1. Clique em **Reset Demo** para limpar o banco
2. Ajuste os sliders de pessoas, valores ST e PagBank
3. Execute os 5 passos: ST → PagBank → Câmera → Espécie → Motor de Regras
4. O passo "Câmera Detecta Espécie" simula um pagamento em dinheiro sem lançamento
5. Veja os alertas na aba **Alertas** e a notificação chegar no Telegram

---

## 7. Rotina Recomendada

| Frequência | Ação |
|-----------|------|
| Por venda (automático) | ST Ingressos envia via webhook em tempo real |
| A cada 30 min (automático) | Câmera atualiza contagem de pessoas |
| A cada turno | Importar CSV do PagBank se não houver webhook |
| Diariamente | Revisar alertas abertos e marcar como auditados |
| Semanalmente | Analisar histórico de gaps e padrões por operador |
`;

export default function Guide() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 text-primary rounded flex items-center justify-center">
          <BookOpen size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-text uppercase tracking-tight">Manual de Operação</h2>
          <p className="text-text-dim text-sm">Entenda como funcionam as regras de auditoria e hardware.</p>
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-border p-8 lg:p-12 shadow-sm prose prose-invert prose-blue max-w-none">
        <div className="markdown-body">
          <ReactMarkdown>{guideContent}</ReactMarkdown>
        </div>
      </div>
      
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-alt p-6 rounded border border-border border-l-4 border-l-primary">
          <div className="flex items-center gap-2 text-primary mb-2">
            <HelpCircle size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Suporte Técnico</span>
          </div>
          <p className="text-text font-bold text-sm">Problemas com as Câmeras?</p>
          <p className="text-text-dim text-xs mt-1">Sincronize o hardware na aba Configurações.</p>
        </div>
        
        <div className="bg-surface-alt p-6 rounded border border-border border-l-4 border-l-success">
          <div className="flex items-center gap-2 text-success mb-2">
            <ChevronRight size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Dica de Segurança</span>
          </div>
          <p className="text-text font-bold text-sm">Fechamento de Caixa</p>
          <p className="text-text-dim text-xs mt-1">Sempre faça o upload do CSV do PagBank ao final de cada turno.</p>
        </div>
      </div>
    </div>
  );
}

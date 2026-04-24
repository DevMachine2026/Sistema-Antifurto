import React from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen, ChevronRight, HelpCircle } from 'lucide-react';

const guideContent = `# 🛡️ Guia do Sistema Antifraude para Bares

Este guia explica como o seu sistema monitora o bar e garante a integridade da operação.

---

## 1. O que o sistema faz?
O sistema funciona como um "Auditor Digital". Ele cruza três informações:
1. **Câmeras Inteligentes:** Contam quem entra e sai.
2. **Maquinetas (PagBank):** Confirmam o dinheiro real.
3. **Sistemas (Consumo):** Registram os pedidos lançados.

---

## 2. Como as Integrações Funcionam

### 📸 Câmeras (Pessoas)
A cada 30 minutos, o sistema recebe a contagem de pessoas no salão via integração com o hardware.

### 💳 Maquinetas (PagBank)
O sistema audita os valores das transações para garantir que o que foi pago no cartão é o que foi lançado no sistema.

### 🧾 Sistemas de Pedidos (Consumo)
Cruzamos o fluxo de pessoas com os pedidos para identificar se há clientes consumindo sem registro.

---

## 3. Identificando Ações Estranhas

O sistema dispara alertas automáticos:

### 🚩 Alerta R01: "Salão Cheio, Caixa Vazio"
*   **Cenário:** Muitas pessoas no bar, mas zero vendas nos últimos 30min.
*   **Risco:** Consumo sem registro ou "venda externa" por funcionários.

### 🚩 Alerta R02: "Gap Financeiro"
*   **Cenário:** Valor na maquineta é diferente do valor lançado.
*   **Risco:** Desvio de valores ou erro operacional.

---

## 4. Notificações WhatsApp
Ao detectar um erro grave, você recebe um alerta no navegador. Ao clicar, o sistema prepara uma mensagem para o número cadastrado (**85 99199-3833**).
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

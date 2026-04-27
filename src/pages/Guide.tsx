import ReactMarkdown from 'react-markdown';
import { BookOpen, ChevronRight, HelpCircle } from 'lucide-react';

const guideContent = `# Guia do Sistema Antifraude

Este guia explica como o sistema monitora o estabelecimento e garante a integridade da operação.

---

## 1. O que o sistema faz?

O sistema funciona como um **Auditor Digital 24/7**. Ele cruza três fontes de dados em tempo real:

1. **Câmeras Inteligentes** — Contam quantas pessoas estão no salão
2. **Maquinetas (PagBank)** — Confirmam o dinheiro que entrou de fato
3. **Sistema de Consumo (ST Ingressos)** — Registra os pedidos lançados

Todos os dados são armazenados em banco de dados seguro e auditável.

---

## 2. Como as Integrações Funcionam

### Câmeras (Contagem de Pessoas)
A cada 30 minutos, o sistema recebe a contagem de pessoas no salão. A câmera usa IA para identificar formas humanas — não grava rostos, apenas conta.

### Maquinetas (PagBank)
Importe o extrato CSV da maquineta na aba **Importar Dados**. O sistema valida automaticamente se os valores batem com os pedidos lançados.

### Sistema de Pedidos (ST Ingressos)
Importe o relatório de consumo pelo mesmo processo. O motor de regras cruza os dois arquivos instantaneamente.

---

## 3. Alertas Automáticos

### Alerta R01 — "Salão Cheio, Caixa Vazio"
- **Cenário:** Mais de 30 pessoas no bar, mas zero vendas nos últimos 30 minutos
- **Risco:** Consumo sem registro, venda sem lançamento ou falha do sistema de pedidos

### Alerta R02 — "Gap Financeiro"
- **Cenário:** Valor na maquineta difere do valor lançado no sistema por mais de R$ 200
- **Risco:** Desvio de valores, cancelamentos abusivos ou erro operacional grave

---

## 4. Notificações

Quando um alerta crítico é gerado, o sistema dispara **dois canais simultaneamente**:

### Telegram (automático)
- A mensagem é enviada **instantaneamente** para o Telegram do responsável
- Não requer nenhuma interação — chega mesmo com o celular bloqueado
- Configure o bot token e o Chat ID em **Configurações → Telegram**

### WhatsApp (manual)
- O navegador exibe uma **notificação push** (desktop ou celular)
- Ao clicar na notificação, abre o WhatsApp com a mensagem já formatada
- Requer que o navegador esteja aberto e com permissão concedida

O alerta sempre fica registrado na aba **Alertas de Fraude** para auditoria, independente dos canais.

---

## 5. Simulador de Demo

A aba **Simulador Demo** permite testar o sistema de ponta a ponta sem dados reais:

1. Clique em **Reset Demo** para limpar o banco
2. Ajuste os sliders: pessoas no salão, valor ST Ingressos, valor PagBank
3. Execute os 4 passos em sequência: Importar ST → Importar PagBank → Acionar Câmera → Executar Regras
4. Veja o alerta aparecer na aba **Alertas** e a notificação chegar no Telegram

---

## 6. Rotina Recomendada

| Frequência | Ação |
|-----------|------|
| A cada turno | Importar CSV do PagBank e ST Ingressos |
| A cada 30 min | Verificar dashboard (câmera atualiza automaticamente) |
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

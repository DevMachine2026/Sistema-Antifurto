# 🛡️ Sistema Antifraude para Bares e Eventos

Sistema inteligente de monitoramento e auditoria em tempo real que cruza dados de múltiplas fontes para identificar desvios financeiros e operacionais em estabelecimentos comerciais.

**Desenvolvido por RonalDigital**

---

## 📋 Visão Geral

O Sistema Antifraude funciona como um **Auditor Digital 24/7** que monitora continuamente três pilares fundamentais:

1. **📸 Câmeras Inteligentes** - Contagem de pessoas em tempo real
2. **💳 Maquinetas de Pagamento** - Transações financeiras (PagBank)
3. **🧾 Sistema de Pedidos** - Registro de vendas (ST Ingressos)

Ao cruzar essas informações, o sistema identifica automaticamente inconsistências que podem indicar fraudes, erros operacionais ou falhas de processo.

---

## 🎯 Principais Funcionalidades

### Dashboard em Tempo Real
- Visualização gráfica de vendas vs. ocupação
- Indicadores de performance operacional
- Status do sistema e alertas ativos
- Métricas de conversão e eficiência

### Motor de Regras Antifraude

**Regra R01 - "Salão Cheio, Caixa Vazio"**
- Detecta quando há alta ocupação (>30 pessoas) sem vendas registradas nos últimos 30 minutos
- Indica possível consumo sem registro ou falha operacional
- Severidade: Alta

**Regra R02 - "Gap Financeiro"**
- Identifica divergências entre valores da maquineta e sistema de pedidos
- Threshold configurável (padrão: R$ 200,00)
- Indica possível desvio financeiro ou erro de lançamento
- Severidade: Alta

### Central de Alertas
- Notificações push nativas do navegador
- Integração com WhatsApp para alertas críticos
- Histórico completo de alertas
- Sistema de resolução e auditoria

### Importação de Dados
- Upload de arquivos CSV (PagBank, ST Ingressos)
- Validação automática de dados
- Rastreamento de lotes importados
- Relatório de erros e inconsistências

---

## 🔧 Tecnologias Utilizadas

- **Frontend:** React 19 + TypeScript
- **Estilização:** TailwindCSS 4
- **Gráficos:** Recharts
- **Animações:** Motion (Framer Motion)
- **Build:** Vite 6
- **Ícones:** Lucide React

---

## 🚀 Instalação e Execução

### Pré-requisitos
- Node.js (versão 18 ou superior)
- npm ou yarn

### Instalação

```bash
# Clone o repositório
git clone [url-do-repositorio]

# Entre no diretório
cd sistema-antifraude

# Instale as dependências
npm install
```

### Executar em Desenvolvimento

```bash
npm run dev
```

O sistema estará disponível em `http://localhost:3000`

### Build para Produção

```bash
npm run build
```

### Preview da Build

```bash
npm run preview
```

---

## 📊 Como Funciona

### 1. Integração com Câmeras
- Câmeras com IA instaladas na entrada/saída
- Contagem automática de pessoas (sem gravação de rostos)
- Envio de dados a cada 30 minutos
- Tecnologia de detecção de formas humanas

### 2. Integração com Maquinetas
- Importação de extratos CSV do PagBank
- Registro automático de todas as transações
- Categorização por método de pagamento
- Timestamp preciso de cada operação

### 3. Integração com Sistema de Pedidos
- Conexão com ST Ingressos ou similar
- Registro de produtos vendidos
- Valores e horários de cada pedido
- Identificação de operadores

### 4. Cruzamento de Dados
O sistema executa as regras de auditoria automaticamente:
- Compara ocupação vs. vendas
- Valida valores entre maquineta e pedidos
- Identifica padrões anormais
- Dispara alertas quando necessário

### 5. Notificações Inteligentes
- Push notifications no navegador
- Deep link para WhatsApp com mensagem pronta
- Alertas apenas para situações críticas
- Histórico completo para auditoria

---

## 📱 Uso no Dia a Dia

### Para Proprietários
1. Acesse o **Dashboard** para visão geral da operação
2. Monitore a relação entre ocupação e vendas
3. Receba alertas automáticos de situações críticas
4. Revise o histórico na **Central de Alertas**

### Para Gerentes
1. Importe dados das maquinetas na **Central de Ingestão**
2. Verifique alertas pendentes
3. Marque alertas como resolvidos após investigação
4. Configure thresholds nas **Configurações**

### Para Auditores
1. Analise o histórico completo de alertas
2. Cruze informações entre diferentes fontes
3. Identifique padrões de comportamento
4. Gere relatórios de auditoria

---

## ⚙️ Configurações Disponíveis

- **Thresholds de Alerta:** Ajuste o valor mínimo para disparar R02
- **Central WhatsApp:** Configure números para receber alertas
- **Janela de Monitoramento:** Defina horários prioritários
- **Modo Auditoria Estrita:** Aumenta sensibilidade das regras

---

## 🎨 Interface

O sistema utiliza um design moderno e profissional com:
- Tema escuro otimizado para longas sessões
- Código de cores intuitivo (Verde = OK, Vermelho = Crítico)
- Tipografia técnica (JetBrains Mono para dados)
- Animações suaves e responsivas
- Layout adaptável para mobile e desktop

---

## 🔒 Segurança e Privacidade

- Câmeras não gravam rostos, apenas contam pessoas
- Dados armazenados localmente no navegador (MVP)
- Sem envio de informações para servidores externos
- Notificações via APIs nativas do navegador
- Código open-source auditável

---

## 📈 Roadmap

### Fase 1 - MVP (Atual)
- ✅ Dashboard básico
- ✅ Regras R01 e R02
- ✅ Importação CSV
- ✅ Alertas via WhatsApp

### Fase 2 - Expansão
- 🔄 Análise preditiva com IA
- 🔄 Integração API direta com maquinetas
- 🔄 Relatórios avançados
- 🔄 Multi-estabelecimento

### Fase 3 - Enterprise
- 📋 Backend robusto
- 📋 Autenticação e permissões
- 📋 API para integrações
- 📋 App mobile nativo

---

## 🤝 Suporte

Para dúvidas, sugestões ou suporte técnico, entre em contato com **RonalDigital**.

---

## 📄 Licença

Apache-2.0

---

**Sistema Antifraude v1.0 - MVP**  
*Transformando dados em segurança operacional*

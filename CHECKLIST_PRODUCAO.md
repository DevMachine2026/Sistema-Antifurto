# ✅ Checklist de Produção - Sistema Antifraude

## 📋 O que está PRONTO (MVP)

### Interface e Frontend
- ✅ Dashboard responsivo e funcional
- ✅ Página de importação de dados
- ✅ Central de alertas
- ✅ Página de configurações
- ✅ Guia de operação
- ✅ Design system completo (cores, tipografia, componentes)
- ✅ Animações e transições
- ✅ Mobile-friendly
- ✅ Gráficos interativos (Recharts)
- ✅ Ícones e assets

### Lógica de Negócio
- ✅ Motor de regras R01 (Salão cheio, caixa vazio)
- ✅ Motor de regras R02 (Gap financeiro)
- ✅ Sistema de alertas
- ✅ Cálculo de métricas
- ✅ Processamento de transações
- ✅ Histórico de importações
- ✅ Resolução de alertas

### Funcionalidades Básicas
- ✅ Importação de CSV (simulada)
- ✅ Notificações browser
- ✅ Deep link WhatsApp
- ✅ Persistência local (localStorage)
- ✅ Dados de demonstração

---

## 🔴 O que está FALTANDO (Crítico)

### Backend (ZERO implementado)
- ❌ API REST
- ❌ Autenticação de usuários
- ❌ Banco de dados
- ❌ Endpoints de transações
- ❌ Endpoints de alertas
- ❌ Endpoints de importação
- ❌ Webhooks para integrações
- ❌ Validação de dados server-side
- ❌ Rate limiting
- ❌ CORS configurado

### Integrações Reais (ZERO implementado)
- ❌ API PagBank
- ❌ API ST Ingressos
- ❌ API Câmeras
- ❌ WhatsApp Business API
- ❌ Processamento de CSV real
- ❌ Validação de formatos
- ❌ Tratamento de erros de integração

### Segurança
- ❌ HTTPS/SSL
- ❌ Autenticação JWT
- ❌ Criptografia de senhas
- ❌ Proteção CSRF
- ❌ Sanitização de inputs
- ❌ Logs de auditoria
- ❌ Conformidade LGPD

### Infraestrutura
- ❌ Servidor de produção
- ❌ Banco de dados configurado
- ❌ CI/CD pipeline
- ❌ Monitoramento
- ❌ Backup automático
- ❌ Domínio e DNS

---

## 🛠️ Tarefas Técnicas Detalhadas

### 1. Setup do Backend

#### Opção A: Node.js + Express
```bash
# Criar estrutura
mkdir backend
cd backend
npm init -y

# Instalar dependências
npm install express cors dotenv bcrypt jsonwebtoken
npm install pg sequelize  # PostgreSQL
npm install --save-dev typescript @types/node @types/express

# Estrutura de pastas
backend/
├── src/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   └── server.ts
├── .env
└── package.json
```

#### Opção B: Python + FastAPI
```bash
# Criar ambiente virtual
python -m venv venv
source venv/bin/activate

# Instalar dependências
pip install fastapi uvicorn sqlalchemy psycopg2-binary
pip install python-jose[cryptography] passlib[bcrypt]

# Estrutura de pastas
backend/
├── app/
│   ├── api/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   └── main.py
├── .env
└── requirements.txt
```

### 2. Banco de Dados

#### Schema PostgreSQL
```sql
-- Tabela de usuários
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de estabelecimentos
CREATE TABLE establishments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de transações
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES establishments(id),
    source VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    imported_at TIMESTAMP DEFAULT NOW(),
    batch_id UUID,
    operator_id VARCHAR(255)
);

-- Tabela de contagem de pessoas
CREATE TABLE people_count (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES establishments(id),
    camera_id VARCHAR(255) NOT NULL,
    count_in INTEGER NOT NULL,
    count_out INTEGER NOT NULL,
    people_inside INTEGER NOT NULL,
    recorded_at TIMESTAMP NOT NULL
);

-- Tabela de alertas
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES establishments(id),
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    context JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de lotes de importação
CREATE TABLE import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES establishments(id),
    source VARCHAR(50) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    rows_total INTEGER NOT NULL,
    rows_imported INTEGER NOT NULL,
    rows_failed INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    imported_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_transactions_establishment ON transactions(establishment_id);
CREATE INDEX idx_transactions_occurred_at ON transactions(occurred_at);
CREATE INDEX idx_alerts_establishment ON alerts(establishment_id);
CREATE INDEX idx_alerts_resolved ON alerts(resolved);
```

### 3. Endpoints da API

```typescript
// Autenticação
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/refresh
POST   /api/auth/logout

// Transações
GET    /api/transactions
POST   /api/transactions
GET    /api/transactions/:id
DELETE /api/transactions/:id

// Alertas
GET    /api/alerts
GET    /api/alerts/:id
PATCH  /api/alerts/:id/resolve
DELETE /api/alerts/:id

// Contagem de pessoas
GET    /api/people-count
POST   /api/people-count

// Importação
POST   /api/import/csv
GET    /api/import/batches
GET    /api/import/batches/:id

// Webhooks
POST   /api/webhooks/pagbank
POST   /api/webhooks/st-ingressos
POST   /api/webhooks/camera

// Configurações
GET    /api/settings
PATCH  /api/settings

// Relatórios
GET    /api/reports/daily
GET    /api/reports/weekly
GET    /api/reports/monthly
```

### 4. Integrações

#### PagBank
```typescript
// Documentação: https://dev.pagbank.uol.com.br/
// Necessário:
- Token de API
- Webhook URL configurado
- Tratamento de eventos: payment.created, payment.updated
```

#### ST Ingressos
```typescript
// Verificar documentação específica
// Alternativa: Importação automática de CSV via SFTP/FTP
```

#### Câmeras
```typescript
// Depende do fabricante (Intelbras, Hikvision, etc)
// Opções:
- API REST
- RTSP stream + processamento local
- Webhook de eventos
```

### 5. Deploy

#### Opção 1: VPS (DigitalOcean, Linode, Vultr)
```bash
# Servidor Ubuntu 22.04
# 2GB RAM mínimo, 4GB recomendado

# Instalar dependências
sudo apt update
sudo apt install nginx postgresql nodejs npm

# Configurar PostgreSQL
sudo -u postgres createdb antifraude
sudo -u postgres createuser antifraude_user

# Configurar Nginx
# /etc/nginx/sites-available/antifraude

# SSL com Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com
```

#### Opção 2: Docker
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
  
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/antifraude
    depends_on:
      - db
  
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=antifraude
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 6. Variáveis de Ambiente

```bash
# Backend .env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/antifraude
JWT_SECRET=seu_secret_super_seguro_aqui
JWT_EXPIRES_IN=7d

# APIs
PAGBANK_API_KEY=sua_chave_aqui
PAGBANK_WEBHOOK_SECRET=seu_secret_aqui
ST_INGRESSOS_API_KEY=sua_chave_aqui
WHATSAPP_API_KEY=sua_chave_aqui

# Configurações
ALERT_THRESHOLD_R02=200
ALERT_WINDOW_R01=30
```

---

## 📊 Estimativa de Tempo por Tarefa

| Tarefa | Tempo Estimado | Prioridade |
|--------|----------------|------------|
| Setup backend básico | 3 dias | 🔴 Crítica |
| Banco de dados + migrations | 2 dias | 🔴 Crítica |
| Autenticação JWT | 2 dias | 🔴 Crítica |
| CRUD de transações | 2 dias | 🔴 Crítica |
| CRUD de alertas | 1 dia | 🔴 Crítica |
| Integração PagBank | 5 dias | 🔴 Crítica |
| Integração ST Ingressos | 5 dias | 🔴 Crítica |
| Integração Câmeras | 7 dias | 🔴 Crítica |
| Processamento CSV real | 2 dias | 🟡 Alta |
| WhatsApp Business API | 3 dias | 🟡 Alta |
| Deploy em VPS | 2 dias | 🔴 Crítica |
| SSL e domínio | 1 dia | 🔴 Crítica |
| Testes de integração | 5 dias | 🟡 Alta |
| Documentação | 3 dias | 🟢 Média |

**Total: ~43 dias úteis (8-9 semanas)**

---

## 🎯 Ordem de Implementação Recomendada

### Sprint 1 (Semana 1-2): Fundação
1. Setup do backend
2. Banco de dados
3. Autenticação
4. Deploy básico

### Sprint 2 (Semana 3-4): APIs Core
1. CRUD completo
2. Conectar frontend ao backend
3. Testes básicos

### Sprint 3 (Semana 5-6): Integrações
1. PagBank
2. ST Ingressos
3. Processamento CSV

### Sprint 4 (Semana 7-8): Câmeras e Notificações
1. Integração câmeras
2. WhatsApp Business
3. Ajustes finais

### Sprint 5 (Semana 9): Testes e Go-Live
1. Testes completos
2. Correções de bugs
3. Deploy em produção
4. Monitoramento

---

## 💡 Dicas Importantes

1. **Comece simples**: Não tente fazer tudo de uma vez
2. **Teste em staging**: Sempre teste antes de produção
3. **Monitore tudo**: Logs são seus melhores amigos
4. **Backup diário**: Configure desde o dia 1
5. **Documentação**: Documente enquanto desenvolve
6. **Segurança primeiro**: Nunca comprometa segurança por velocidade

---

**By RonalDigital**

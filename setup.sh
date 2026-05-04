#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[aviso]${NC} $*"; }
err()  { echo -e "${RED}[erro]${NC} $*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Docker ────────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Docker não encontrado. Instalando via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  warn "Adicionado ao grupo docker. Pode ser necessário reiniciar a sessão."
else
  log "Docker já instalado: $(docker --version)"
fi

if ! docker compose version &>/dev/null 2>&1; then
  if ! command -v docker-compose &>/dev/null; then
    err "docker compose plugin não encontrado. Instale o Docker Engine >= 20.10."
    exit 1
  fi
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

# ── Variáveis de ambiente ─────────────────────────────────────────────────────
if [ -f .env ]; then
  warn "Arquivo .env já existe. Deseja sobrescrevê-lo? [s/N] "
  read -r OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[sS]$ ]]; then
    log "Mantendo .env existente."
  else
    rm .env
  fi
fi

if [ ! -f .env ]; then
  echo ""
  log "Configure as credenciais do Supabase:"
  echo ""

  read -rp "  SUPABASE_URL (ex: https://xxxx.supabase.co): " SUPABASE_URL
  while [[ -z "$SUPABASE_URL" ]]; do
    warn "SUPABASE_URL não pode ser vazia."
    read -rp "  SUPABASE_URL: " SUPABASE_URL
  done

  read -rp "  SUPABASE_ANON_KEY (começa com eyJ...): " SUPABASE_ANON_KEY
  while [[ -z "$SUPABASE_ANON_KEY" ]]; do
    warn "SUPABASE_ANON_KEY não pode ser vazia."
    read -rp "  SUPABASE_ANON_KEY: " SUPABASE_ANON_KEY
  done

  cat > .env <<EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
PORT=3456
MEDIAMTX_API=http://127.0.0.1:9997
EOF

  log ".env criado com sucesso."
fi

# ── Subir containers ──────────────────────────────────────────────────────────
log "Baixando imagens e construindo containers..."
$COMPOSE_CMD pull mediamtx
$COMPOSE_CMD up -d --build

# ── IP local ──────────────────────────────────────────────────────────────────
IP_LOCAL=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Sistema Antifraude rodando com sucesso!   ${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  Backend:   ${YELLOW}http://${IP_LOCAL}:3456${NC}"
echo -e "  HLS:       ${YELLOW}http://${IP_LOCAL}:8888${NC}"
echo -e "  RTSP:      ${YELLOW}rtsp://${IP_LOCAL}:8554${NC}"
echo -e "  API MTX:   ${YELLOW}http://${IP_LOCAL}:9997${NC}"
echo ""
log "Configure no frontend (Vercel): VITE_API_URL=http://${IP_LOCAL}:3456"
echo ""

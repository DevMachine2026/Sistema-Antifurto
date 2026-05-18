#!/usr/bin/env bash
# Roda o agente local com webcam (após dev-webcam-setup.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:-}}"

if [[ -f agent/token.dev ]]; then
  export ESTABLISHMENT_TOKEN="$(tr -d '[:space:]' < agent/token.dev)"
elif [[ -z "${ESTABLISHMENT_TOKEN:-}" ]]; then
  echo "Erro: rode primeiro ./scripts/dev-webcam-setup.sh ou export ESTABLISHMENT_TOKEN=..." >&2
  exit 1
fi

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" ]]; then
  echo "Erro: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env" >&2
  exit 1
fi

VENV="$ROOT/agent/.venv"
if [[ ! -d "$VENV" ]]; then
  echo "→ Criando venv em agent/.venv"
  python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install -q -r agent/requirements.txt

ONNX="$ROOT/agent/yolov8n.onnx"
if [[ ! -f "$ONNX" ]]; then
  echo "→ Baixando/exportando yolov8n.onnx (primeira vez, ~1 min)"
  pip install -q ultralytics
  (cd agent && python3 -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx', imgsz=640)")
  if [[ -f agent/yolov8n.onnx ]]; then
    :
  elif [[ -f "$ROOT/yolov8n.onnx" ]]; then
    cp "$ROOT/yolov8n.onnx" "$ONNX"
  else
  find "$ROOT/agent" -maxdepth 2 -name 'yolov8n.onnx' -exec cp {} "$ONNX" \;
  fi
fi
export YOLO_MODEL_PATH="$ONNX"

echo "→ Iniciando agente Olho Vivo (modo dev / webcam)"
echo "→ Token: ${ESTABLISHMENT_TOKEN:0:8}..."
echo "→ Webcam: ip=webcam no agent_configs"
echo "→ Pare com Ctrl+C"
echo ""

exec python3 -m agent.main

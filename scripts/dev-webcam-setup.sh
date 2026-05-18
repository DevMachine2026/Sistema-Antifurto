#!/usr/bin/env bash
# Configura agent_configs.cameras para teste com webcam (ip: "webcam").
# Uso:
#   export SUPABASE_SERVICE_ROLE_KEY="sua-service-role"
#   ./scripts/dev-webcam-setup.sh "Eduardo Teste"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${VITE_SUPABASE_SERVICE_ROLE_KEY:-}}"
AGENT_NAME="${1:-Eduardo Teste}"
CAMERA_ID="${2:-webcam-teste}"

if [[ -z "$SUPABASE_URL" ]]; then
  echo "Erro: defina SUPABASE_URL ou VITE_SUPABASE_URL no .env" >&2
  exit 1
fi
if [[ -z "$SERVICE_KEY" ]]; then
  echo "Erro: export SUPABASE_SERVICE_ROLE_KEY=... (Dashboard → Settings → API → service_role)" >&2
  exit 1
fi

ENC_NAME=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$AGENT_NAME")

echo "→ Buscando agente: $AGENT_NAME"
ROWS=$(curl -sS "${SUPABASE_URL}/rest/v1/agent_configs?name=eq.${ENC_NAME}&select=id,name,token,establishment_id&active=eq.true" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

COUNT=$(echo "$ROWS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
if [[ "$COUNT" -eq 0 ]]; then
  echo "Nenhum agente ativo com name='$AGENT_NAME'." >&2
  echo "Crie o agente no painel (Agentes) ou confira o nome exato." >&2
  exit 1
fi
if [[ "$COUNT" -gt 1 ]]; then
  echo "Mais de um agente com esse nome — use um nome único." >&2
  echo "$ROWS" | python3 -m json.tool
  exit 1
fi

AGENT_ID=$(echo "$ROWS" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
TOKEN=$(echo "$ROWS" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['token'])")
EST_ID=$(echo "$ROWS" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['establishment_id'])")

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BODY=$(CAMERA_ID="$CAMERA_ID" NOW="$NOW" python3 <<'PY'
import json, os
cameras = [{
    "id": os.environ["CAMERA_ID"],
    "ip": "webcam",
    "user": "",
    "pass": "",
    "role": "counting",
    "name": "Webcam teste",
    "line_y": 0.5,
    "rtsp_path": "/stream1",
}]
print(json.dumps({"cameras": cameras, "config_changed_at": os.environ["NOW"]}))
PY
)

echo "→ Atualizando cameras (id=$AGENT_ID, camera_id=$CAMERA_ID)"
HTTP=$(curl -sS -o /tmp/olhovivo-patch.json -w "%{http_code}" \
  -X PATCH "${SUPABASE_URL}/rest/v1/agent_configs?id=eq.${AGENT_ID}" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "$BODY")

if [[ "$HTTP" != "204" && "$HTTP" != "200" ]]; then
  echo "PATCH falhou (HTTP $HTTP):" >&2
  cat /tmp/olhovivo-patch.json >&2
  exit 1
fi

mkdir -p agent
printf '%s\n' "$TOKEN" > agent/token.dev
printf '%s\n' "$EST_ID" > agent/establishment.dev

echo ""
echo "OK — agente configurado."
echo "  Nome:           $AGENT_NAME"
echo "  camera_id:      $CAMERA_ID"
echo "  establishment:  $EST_ID"
echo "  Token salvo em: agent/token.dev"
echo ""
echo "Próximo comando:"
echo "  ./scripts/dev-webcam-run.sh"

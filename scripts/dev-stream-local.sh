#!/usr/bin/env bash
# Fluxo local: MediaMTX (Docker ou binário nativo) + ffmpeg (webcam ou teste).
# Uso:
#   ./scripts/dev-stream-local.sh              # tenta /dev/video0
#   USE_TESTSRC=1 ./scripts/dev-stream-local.sh
#   VIDEO_DEVICE=/dev/video1 ./scripts/dev-stream-local.sh
#   DOCKER_SUDO=1 ./scripts/dev-stream-local.sh   # usa sudo com docker (evita grupo docker)
#   USE_NATIVE_MEDIAMTX=1 ./scripts/dev-stream-local.sh  # força binário mediamtx no PATH
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MEDIAMTX_YML="$ROOT/server/mediamtx.yml"
DEVICE="${VIDEO_DEVICE:-/dev/video0}"
USE_TESTSRC="${USE_TESTSRC:-0}"
MEDIAMTX_CONTAINER="${MEDIAMTX_CONTAINER:-olho-vivo-mediamtx}"
MEDIAPID=""
STARTED_OUR_DOCKER=0

if ! command -v ffmpeg >/dev/null; then
  echo "Instale ffmpeg."
  exit 1
fi

docker_cmd() {
  if [[ "${DOCKER_SUDO:-}" == "1" ]]; then
    echo "sudo docker"
    return
  fi
  if docker info >/dev/null 2>&1; then
    echo "docker"
    return
  fi
  echo ""
}

docker_sock_help() {
  cat <<'EOF'

[!] Seu usuário não tem permissão para usar o Docker (socket /var/run/docker.sock).

  Opção A — recomendada (acesso sem sudo):
    sudo usermod -aG docker "$USER"
    Feche o terminal, abra outro (ou: newgrp docker) e rode o script de novo.

  Opção B — só para este terminal:
    newgrp docker
    ./scripts/dev-stream-local.sh

  Opção C — usar sudo com Docker neste script:
    DOCKER_SUDO=1 ./scripts/dev-stream-local.sh

  Opção D — sem Docker: instale o binário mediamtx e use:
    USE_NATIVE_MEDIAMTX=1 ./scripts/dev-stream-local.sh
    (https://github.com/bluenviron/mediamtx/releases — extraia e coloque no PATH)

EOF
}

mediamtx_api_ok() {
  command -v curl >/dev/null 2>&1 || return 1
  curl -sf --max-time 2 "http://127.0.0.1:9997/v3/paths/list" >/dev/null 2>&1
}

start_mediamtx_native() {
  if ! command -v mediamtx >/dev/null; then
    return 1
  fi
  echo "==> Subindo MediaMTX nativo ($MEDIAMTX_YML)…"
  mediamtx "$MEDIAMTX_YML" &
  MEDIAPID=$!
  sleep 1
  return 0
}

start_mediamtx_docker() {
  if mediamtx_api_ok; then
    echo "==> MediaMTX já responde na API (:9997). Não vamos subir outro container (evita 'port is already allocated')."
    return 0
  fi
  local dc
  dc="$(docker_cmd)"
  if [[ -z "$dc" ]]; then
    return 1
  fi
  echo "==> Subindo MediaMTX no Docker ($dc, portas 8554 / 8888 / 9997)…"
  $dc rm -f "$MEDIAMTX_CONTAINER" 2>/dev/null || true
  if $dc run -d --name "$MEDIAMTX_CONTAINER" \
    -p 8554:8554 -p 8888:8888 -p 9997:9997 \
    -v "$MEDIAMTX_YML:/mediamtx.yml:ro" \
    bluenviron/mediamtx:latest; then
    STARTED_OUR_DOCKER=1
    return 0
  fi
  if command -v docker-compose >/dev/null && docker-compose -f "$ROOT/docker-compose.yml" up --detach mediamtx; then
    return 0
  fi
  if docker compose version >/dev/null 2>&1 && docker compose -f "$ROOT/docker-compose.yml" up --detach mediamtx; then
    return 0
  fi
  return 1
}

start_mediamtx() {
  if [[ "${USE_NATIVE_MEDIAMTX:-0}" == "1" ]]; then
    if mediamtx_api_ok; then
      echo "==> MediaMTX já ativo (:9997). USE_NATIVE_MEDIAMTX ignorado (evita segundo processo)."
      return
    fi
    start_mediamtx_native || { echo "mediamtx não encontrado no PATH."; exit 1; }
    return
  fi
  if mediamtx_api_ok; then
    echo "==> MediaMTX já está rodando (API :9997). Pulando Docker."
    return
  fi
  if start_mediamtx_docker; then
    return
  fi
  echo "Docker indisponível ou sem permissão. Tentando mediamtx nativo…"
  if start_mediamtx_native; then
    return
  fi
  docker_sock_help
  echo "Falha ao subir MediaMTX (Docker e binário nativo)."
  exit 1
}

start_mediamtx

cleanup() {
  if [[ -n "${FFPID:-}" ]] && kill -0 "$FFPID" 2>/dev/null; then
    kill "$FFPID" 2>/dev/null || true
  fi
  if [[ -n "${MEDIAPID:-}" ]] && kill -0 "$MEDIAPID" 2>/dev/null; then
    kill "$MEDIAPID" 2>/dev/null || true
  fi
  echo ""
  if [[ -n "${MEDIAPID:-}" ]]; then
    echo "==> ffmpeg encerrado; MediaMTX nativo encerrado."
  elif [[ "$STARTED_OUR_DOCKER" == "1" ]]; then
    echo "==> ffmpeg encerrado. Para remover o container deste script: docker rm -f $MEDIAMTX_CONTAINER"
  else
    echo "==> ffmpeg encerrado. MediaMTX segue como já estava (ex.: docker compose)."
  fi
}
trap cleanup INT TERM EXIT

sleep 2

if [[ "$USE_TESTSRC" == "1" ]]; then
  echo "==> Publicando vídeo de teste (lavfi) no path RTSP 'teste'…"
  ffmpeg -hide_banner -loglevel warning -re \
    -f lavfi -i "testsrc=size=960x540:rate=15" \
    -vf format=yuv420p \
    -c:v libx264 -preset ultrafast -tune zerolatency \
    -rtsp_transport tcp -f rtsp "rtsp://127.0.0.1:8554/teste" &
  FFPID=$!
else
  if [[ ! -e "$DEVICE" ]]; then
    echo "Dispositivo $DEVICE não encontrado. Use USE_TESTSRC=1 ou plugue a webcam."
    exit 1
  fi
  echo "==> Publicando webcam $DEVICE no path RTSP 'teste'…"
  echo "    [dica] 'Device or resource busy' = outro app está usando a câmera (Zoom, navegador, outro ffmpeg)."
  echo "           Feche ou use USE_TESTSRC=1 ou VIDEO_DEVICE=/dev/video1"
  ffmpeg -hide_banner -loglevel warning \
    -f v4l2 -framerate 15 -video_size 1280x720 -i "$DEVICE" \
    -vf format=yuv420p \
    -c:v libx264 -preset ultrafast -tune zerolatency \
    -rtsp_transport tcp -f rtsp "rtsp://127.0.0.1:8554/teste" &
  FFPID=$!
fi

echo ""
echo "ffmpeg em background (PID $FFPID). Próximos passos:"
echo "  1. .env: MEDIAMTX_API=http://127.0.0.1:9997, MEDIAMTX_HLS_URL=http://localhost:8888, PORT=3456, SUPABASE_*"
echo "  2. cd server && npm run dev"
echo "  3. npm run dev (frontend)"
echo "  4. Supabase cameras: camera_id=teste, brand=generic, status=online, ip=127.0.0.1"
echo ""
echo "Ctrl+C encerra ffmpeg (e MediaMTX nativo, se estiver em uso)."

wait $FFPID || true

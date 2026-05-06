#!/usr/bin/env bash
# Gera o executável do Olho Vivo Agent para Linux.
# Executar a partir da raiz do repositório.
set -euo pipefail

echo "=== Olho Vivo Agent — build Linux ==="

VENV="agent/.venv"

if [ ! -d "$VENV" ]; then
    python3.11 -m venv "$VENV"
fi

"$VENV/bin/pip" install --upgrade pip --quiet
"$VENV/bin/pip" install -r agent/requirements.txt --quiet
"$VENV/bin/pip" install lapx>=0.5.12 --quiet
"$VENV/bin/pip" install pyinstaller --quiet

PYTHONPATH=$(pwd) "$VENV/bin/pyinstaller" agent/olhovivo-agent.spec --noconfirm --workpath /tmp/olhovivo-build --distpath dist

echo ""
echo "=== Build concluído ==="
echo "Executável: dist/olhovivo-agent/olhovivo-agent"
echo ""
echo "Para distribuir: zip -r olhovivo-agent-linux.zip dist/olhovivo-agent/"

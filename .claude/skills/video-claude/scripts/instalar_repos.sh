#!/usr/bin/env bash
# Instala en una sesión nueva las herramientas de los repos que usamos (gratis, sin GPU).
# Uso: bash instalar_repos.sh [carpeta]   (por defecto /tmp/claude-0)
# Lee antes el código de cada repo: aquí se fijan versiones revisadas (commit/tag) para no correr cambios sin revisar.
set -euo pipefail
BASE="${1:-/tmp/claude-0}"; mkdir -p "$BASE/repos"; cd "$BASE"
[ -x herr/bin/python ] || python3 -m venv herr
herr/bin/pip install -q --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
# earshot (MIT): oídos para el agente + banco de 252 sonidos hechos con código
[ -d repos/earshot ] || git clone -q https://github.com/Leonxlnx/earshot.git repos/earshot
git -C repos/earshot checkout -q 4ac3d2a
herr/bin/pip install -q --no-cache-dir -e repos/earshot scenedetect auto-editor
herr/bin/earshot doctor --fetch >/dev/null   # baja los 2 modelos (~1.1 GB) una vez
# pixelfx (MIT): 244 efectos pixel art hechos con código (Node)
[ -d repos/pixelfx ] || git clone -q https://github.com/patch-gg/pixelfx.git repos/pixelfx
git -C repos/pixelfx checkout -q 5294518
(cd repos/pixelfx && npm install --silent --no-audit --no-fund)
echo "Listo: $BASE/herr/bin/earshot, $BASE/repos/pixelfx"

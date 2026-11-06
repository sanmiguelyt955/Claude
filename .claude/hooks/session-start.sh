#!/bin/bash
# Instala lo que necesita el MCP video-nube (ver y oír videos) en sesiones de Claude Code en la nube.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# ffmpeg (cuadros, audio, silencios)
if ! command -v ffmpeg >/dev/null; then
  apt-get update
  apt-get install -y ffmpeg
fi

# Paquetes de Python en el Python del sistema; solo se reinstala si cambia algún requirements o este script
pyhashes="$(python3 -I -c 'import sysconfig; print(sysconfig.get_path("purelib"))')/.session-start.sha256"
if ! sha256sum --check --status "$pyhashes" 2>/dev/null; then
  rm -f "$pyhashes"
  # torch solo CPU (mucho más ligero que la versión con CUDA)
  python3 -m pip install -q torch torchaudio torchvision --index-url https://download.pytorch.org/whl/cpu
  python3 -m pip install -q -r requirements.txt -r requirements-escucha.txt
  sha256sum .claude/hooks/session-start.sh requirements.txt requirements-escucha.txt > "$pyhashes" || rm -f "$pyhashes"
fi

# /watch (skill de terceros): motor Gemini con un modelo menos saturado. La clave NO va aquí: la pone el proxy si el
# entorno tiene el secreto de red generativelanguage.googleapis.com (x-goog-api-key). Solo añade lo que falte.
mkdir -p "$HOME/.config/watch"
w="$HOME/.config/watch/.env"
touch "$w"; chmod 600 "$w"
grep -q '^WATCH_ENGINE=' "$w" || echo 'WATCH_ENGINE="gemini"' >> "$w"
grep -q '^WATCH_GEMINI_MODEL=' "$w" || echo 'WATCH_GEMINI_MODEL="gemini-3-flash-preview"' >> "$w"
grep -q '^GEMINI_API_KEY=.' "$w" || { sed -i '/^GEMINI_API_KEY=$/d' "$w"; echo 'GEMINI_API_KEY=proxy-injected' >> "$w"; }

#!/usr/bin/env bash
# Valida/instala dependencias. Seguro de ejecutar varias veces.
set -e
command -v ffmpeg >/dev/null || { echo "Falta ffmpeg (apt-get install -y ffmpeg)"; exit 1; }
echo "ffmpeg: $(ffmpeg -version | head -1)"
python3 -c "import faster_whisper" 2>/dev/null || { echo "Instalando faster-whisper..."; pip install -q faster-whisper; }
echo "faster-whisper: OK"
fc-list | grep -qi -E "montserrat|dejavu|liberation" && echo "fuentes: OK" || echo "AVISO: pocas fuentes; instala fonts-liberation o copia las fuentes de la marca a ~/.fonts"
command -v node >/dev/null && echo "node: $(node -v)" || echo "AVISO: sin node (necesario para Remotion)"

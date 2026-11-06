#!/usr/bin/env bash
# Instala Blender (sin interfaz) solo cuando se necesita: ~350 MB de descarga, ~1.3 GB en disco, ~1 min.
# Uso: bash instalar_blender.sh  → imprime la ruta del ejecutable.
set -euo pipefail
VER="${BLENDER_VER:-4.2.3}"; DIR="${BLENDER_DIR:-/opt/blender-dl}"
BIN="$DIR/blender-$VER-linux-x64/blender"
if [ ! -x "$BIN" ]; then
  mkdir -p "$DIR"; cd "$DIR"
  curl -sSL -o blender.tar.xz "https://download.blender.org/release/Blender${VER%.*}/blender-$VER-linux-x64.tar.xz"
  tar -xf blender.tar.xz && rm -f blender.tar.xz
fi
# OpenGL por software (Mesa) para Workbench/EEVEE en servidores sin tarjeta gráfica
if ! ldconfig -p 2>/dev/null | grep -q libEGL.so.1; then
  (apt-get install -y -q libegl1 libgl1-mesa-dri libegl-mesa0 libgles2 >/dev/null 2>&1 || \
   (apt-get update -q >/dev/null 2>&1 && apt-get install -y -q libegl1 libgl1-mesa-dri libegl-mesa0 libgles2 >/dev/null 2>&1)) || true
fi
echo "$BIN"

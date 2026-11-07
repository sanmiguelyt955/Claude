#!/bin/bash
# Abre Vertiflow en el navegador (Mac). Requiere Node.js 22 y FFmpeg.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --omit=dev
node bin/cli.js app

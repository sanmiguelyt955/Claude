#!/usr/bin/env bash
# Reproduce la investigación de Higgsfield con REA (Reverse Engineer Anything).
# Solo observa lo que un navegador anónimo descarga de higgsfield.ai: no inicia sesión,
# no genera nada y no evade protecciones (Cloudflare / DataDome).
#
# Requisitos: Node >= 22.19, un Chromium/Chrome, python3.
# Uso: CHROME=/ruta/a/chrome ./reproduce.sh [directorio_de_trabajo]
set -euo pipefail

WORK="${1:-$(mktemp -d)}"
CHROME="${CHROME:-$(command -v chromium || command -v google-chrome)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$WORK"/{evidence,bundle/assets,profile}
cd "$WORK"

npm init -y >/dev/null && npm i rea-agents@latest >/dev/null
REA="npx rea"

# 1. Navegador con CDP en loopback (REA "connect mode").
PROXY_ARGS=()
[ -n "${HTTPS_PROXY:-}" ] && PROXY_ARGS=(--proxy-server="$HTTPS_PROXY")
"$CHROME" --headless=new --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
  --user-data-dir="$WORK/profile" "${PROXY_ARGS[@]}" https://higgsfield.ai/ >/dev/null 2>&1 &
CHROME_PID=$!
trap 'kill $CHROME_PID 2>/dev/null || true' EXIT
sleep 8
TARGET=$(curl -s http://127.0.0.1:9222/json/list | python3 -c \
  "import json,sys;print([x['id'] for x in json.load(sys.stdin) if x['type']=='page'][0])")

# 2. REA: análisis estático del bundle de la home + source maps.
$REA analyze-web-bundle http://127.0.0.1:9222 "$TARGET" --observation-ms 8000 \
  --fetch-source-maps --format json --full-output > evidence/web-bundle-home.json

# 3. REA: escenario declarativo que recorre las rutas principales capturando red/consola.
sed "s/\"target_id\": *\"[^\"]*\"/\"target_id\": \"$TARGET\"/" "$HERE/browser-scenario.example.json" > scenario.json
$REA capture-browser-scenario scenario.json --format json --full-output > evidence/scenario.json

# 4. Descargar los chunks JS observados (son assets públicos) y reconstruir la app con REA.
python3 -I - evidence/scenario.json <<'EOF' | grep assets.higgsfield.ai > jsurls.txt
import json,sys
d=json.load(open(sys.argv[1]))['data']
print('\n'.join(sorted({e['url']['url'] for e in d['normalized_result']['events']['items']
      if e['kind']=='request' and e['resource_type']=='script'})))
EOF
(cd bundle/assets && xargs -P 16 -n 20 curl -sS --remote-name-all < ../../jsurls.txt)
$REA analyze-javascript-application "$WORK/bundle" --format json --full-output > evidence/jsapp.json

# 5. Extracciones complementarias (rutas construidas con template literals que REA marca como "unknown").
cd bundle/assets
grep -ohE 'https://(dev-)?fnf-[a-z-]*\.higgsfield\.ai/[a-z0-9-]*' *.js | sort -u > "$WORK/evidence/services.txt"
grep -ohE 'fetch\([A-Za-z_$]{1,4}\(`/[^`]{1,150}`' *.js | sed -E 's/^fetch\([A-Za-z_$]+\(`//; s/`$//; s/\$\{[^}]*\}/{x}/g' \
  | sort | uniq -c | sort -rn > "$WORK/evidence/fetch-paths.txt"
f=$(grep -l 'QWEN_AUDIO_TTS=' *.js | head -1)
grep -oE 'e\.[A-Z0-9_]+=`[a-z0-9_]+`' "$f" | sed -E 's/e\.([A-Z0-9_]+)=`([^`]+)`/\1\t\2/' | awk '!s[$1]++' > "$WORK/evidence/job-types.tsv"

echo "Evidencias en $WORK/evidence"

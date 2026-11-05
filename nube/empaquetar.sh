#!/usr/bin/env bash
# Genera en dist/ los paquetes para subir a Cowork / claude.ai:
#   dist/video-claude.zip  (la skill única: ver, oír, música y edición)
#   dist/video-claude.plugin                  (plugin con la skill; el conector se añade aparte)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist; mkdir -p "$OUT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for s in video-claude; do
  (cd .claude/skills && zip -qr "../../$OUT/$s.zip" "$s" -x "*/node_modules/*" "*/__pycache__/*")
done
mkdir -p "$TMP/p/.claude-plugin" "$TMP/p/skills"
cp .claude-plugin/icon.png "$TMP/p/.claude-plugin/"
python3 - "$TMP/p/.claude-plugin/plugin.json" <<'PY'
import json, sys
d = json.load(open(".claude-plugin/plugin.json"))
d["skills"] = "./skills"
d["icon"] = "./.claude-plugin/icon.png"
d.pop("mcpServers", None)   # en Cowork el conector se añade como "conector personalizado" (no se mete la URL secreta en el paquete)
json.dump(d, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
PY
for s in video-claude; do
  (cd .claude/skills && tar --exclude node_modules --exclude __pycache__ -cf - "$s") | (cd "$TMP/p/skills" && tar -xf -)
done
rm -f "$OUT/video-claude.plugin"
(cd "$TMP/p" && zip -qr - .) > "$OUT/video-claude.plugin"
ls -la "$OUT"

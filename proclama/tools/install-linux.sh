#!/usr/bin/env bash
# Instala Proclama en Linux para tu usuario (sin sudo): copia la app, usa tu Node si es 22.5 o más nuevo (si no, descarga uno
# propio desde nodejs.org, verificado con su huella oficial), crea el comando «proclama» y el icono en el menú de aplicaciones.
# Uso:   bash tools/install-linux.sh            instalar o actualizar
#        bash tools/install-linux.sh --quitar   desinstalar (tus canciones y Biblias no se tocan)
#        bash tools/install-linux.sh --descargar-node   usar siempre el Node propio
# Los datos (canciones, Biblias, medios, PDF) quedan en ~/.local/share/proclama.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${PROCLAMA_HOME:-$HOME/.local/opt/proclama}"
BIN="$HOME/.local/bin"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
NEED_MAJOR=22; NEED_MINOR=5

if [ "${1:-}" = "--quitar" ]; then
  rm -rf "$DEST" "$BIN/proclama" "$APPS/proclama.desktop"
  command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" 2>/dev/null || true
  echo "Proclama se desinstaló. Tus datos siguen en ${XDG_DATA_HOME:-$HOME/.local/share}/proclama (bórralos a mano si quieres)."
  exit 0
fi

node_ok() { # ¿este node sirve? (22.5 o más nuevo)
  local v; v="$("$1" -p 'process.versions.node' 2>/dev/null)" || return 1
  local maj="${v%%.*}" rest="${v#*.}"; local min="${rest%%.*}"
  [ "$maj" -gt "$NEED_MAJOR" ] || { [ "$maj" -eq "$NEED_MAJOR" ] && [ "$min" -ge "$NEED_MINOR" ]; }
}

NODE=""
if [ "${1:-}" != "--descargar-node" ] && command -v node >/dev/null && node_ok "$(command -v node)"; then
  NODE="$(command -v node)"
  echo "Usando el Node de tu sistema ($("$NODE" -v))."
else
  case "$(uname -m)" in x86_64) A=x64 ;; aarch64|arm64) A=arm64 ;; *) echo "Arquitectura no admitida: $(uname -m)" >&2; exit 1 ;; esac
  echo "Descargando Node.js (una sola vez)…"
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  SUMS_URL="https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt"
  curl -fsSL "$SUMS_URL" -o "$TMP/sums"
  FILE="$(grep -o "node-v[0-9.]*-linux-$A\.tar\.xz" "$TMP/sums" | head -1)"
  [ -n "$FILE" ] || { echo "No encontré Node para linux-$A" >&2; exit 1; }
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$FILE" -o "$TMP/$FILE"
  WANT="$(grep " $FILE\$" "$TMP/sums" | cut -d' ' -f1)"
  GOT="$(sha256sum "$TMP/$FILE" | cut -d' ' -f1)"
  [ "$WANT" = "$GOT" ] || { echo "La descarga de Node no coincide con su huella oficial; no se instala." >&2; exit 1; }
  mkdir -p "$DEST/runtime"; rm -rf "$DEST/runtime/node"
  tar -xJf "$TMP/$FILE" -C "$TMP"; mv "$TMP/${FILE%.tar.xz}" "$DEST/runtime/node"
  NODE="$DEST/runtime/node/bin/node"
fi

echo "Copiando Proclama a $DEST …"
mkdir -p "$DEST" "$BIN" "$APPS"
rm -rf "$DEST/app"; mkdir -p "$DEST/app"
(cd "$SRC" && tar cf - --exclude=./data --exclude=./node_modules --exclude=./docs --exclude=./test --exclude=./.git .) | (cd "$DEST/app" && tar xf -)
cp "$SRC/public/icon.svg" "$DEST/icon.svg"

cat > "$DEST/proclama" <<LAUNCH
#!/usr/bin/env bash
exec "$NODE" "$DEST/app/launcher.mjs" "\$@"
LAUNCH
chmod +x "$DEST/proclama"; ln -sf "$DEST/proclama" "$BIN/proclama"

cat > "$APPS/proclama.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Proclama
GenericName=Presentación para iglesias
Comment=Canciones, Biblia, imágenes, videos y PDF para proyectar
Exec=$DEST/proclama
Icon=$DEST/icon.svg
Terminal=false
Categories=Office;Presentation;
StartupWMClass=proclama
DESK
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" 2>/dev/null || true

echo
echo "Listo. Busca «Proclama» en el menú de aplicaciones o escribe: proclama"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "(Si «proclama» no se reconoce, cierra y abre la terminal o añade $BIN al PATH.)" ;; esac
echo "Las actualizaciones llegan con el botón «Actualizar» dentro de la app."

#!/usr/bin/env bash
# Memoria en GitHub, cada sesión.
#   start: baja (o actualiza) el repositorio de memoria y muestra lo esencial.
#   stop : sube a GitHub lo que se haya escrito en la memoria durante la sesión.
# Nunca falla la sesión: si algo sale mal, lo dice en una línea y sigue.
REPO_URL="${MEMORIA_REPO_URL:-https://github.com/sanmiguelyt955/memoria-claude}"
# La carpeta donde la sesión clona los repositorios agregados; si no está, la del usuario.
if [ -n "${MEMORIA_DIR:-}" ]; then DIR="$MEMORIA_DIR"
elif [ -d /home/user/memoria-claude/.git ]; then DIR=/home/user/memoria-claude
else DIR="$HOME/memoria-claude"; fi
BRANCH="${MEMORIA_BRANCH:-main}"

case "${1:-}" in
  start)
    if [ -d "$DIR/.git" ]; then
      git -C "$DIR" pull --ff-only -q origin "$BRANCH" 2>/dev/null || echo "Memoria: no se pudo actualizar $DIR (se usa la copia que hay)."
    else
      git clone --depth 1 -q "$REPO_URL" "$DIR" 2>/dev/null || { echo "Memoria: no se pudo bajar $REPO_URL."; exit 0; }
    fi
    echo "== MEMORIA (carpeta $DIR) =="
    for f in "brain/North Star.md" "org/people/Usuario.md" "brain/Gotchas.md"; do
      [ -f "$DIR/$f" ] && { echo; echo "--- $f ---"; sed -n '1,80p' "$DIR/$f"; }
    done
    ;;
  stop)
    [ -d "$DIR/.git" ] || exit 0
    cd "$DIR" || exit 0
    git add -A 2>/dev/null
    git diff --cached --quiet && { echo "Memoria: nada nuevo que subir."; exit 0; }
    git -c user.name="Claude Code" -c user.email="noreply@anthropic.com" commit -q -m "Memoria de sesión $(date -u '+%F %H:%M') UTC" 2>/dev/null || exit 0
    if git push -q origin "HEAD:$BRANCH" 2>/dev/null; then
      echo "Memoria: subida a GitHub."
    elif git pull --rebase -q origin "$BRANCH" 2>/dev/null && git push -q origin "HEAD:$BRANCH" 2>/dev/null; then
      echo "Memoria: subida a GitHub (tras combinar cambios)."
    else
      echo "Memoria: no se pudo subir a GitHub (¿está memoria-claude agregado a esta sesión?). Quedó guardada en $DIR."
    fi
    ;;
  *) echo "uso: memoria-sync.sh start|stop" ;;
esac
exit 0

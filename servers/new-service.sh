#!/usr/bin/env bash
# Create a new HTTP service from servers/template.
# Usage: servers/new-service.sh <name>
#   name: lowercase letters, digits and dashes (becomes the Cloud Run service name)
set -euo pipefail

NAME="${1:-}"
if [[ ! "$NAME" =~ ^[a-z][a-z0-9-]{1,40}$ ]]; then
  echo "usage: $0 <name>  (lowercase, digits, dashes; 2-41 chars, starts with a letter)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$ROOT/services/$NAME"

if [[ -e "$DEST" ]]; then
  echo "error: $DEST already exists" >&2
  exit 1
fi

mkdir -p "$DEST"
cp "$ROOT/template/"* "$ROOT/template/".dockerignore "$DEST/"
# Fill in the service name placeholder.
sed -i "s/__SERVICE__/$NAME/g" "$DEST/main.py"

echo "created $DEST"
echo "run locally:  cd $DEST && uvicorn main:app --reload --port 8080"
echo "deploy:       servers/deploy.sh services/$NAME"

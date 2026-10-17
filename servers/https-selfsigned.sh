#!/usr/bin/env bash
# Generate a self-signed TLS certificate for local or private use.
# Usage: servers/https-selfsigned.sh [output-dir] [hostname] [days]
# Writes key.pem and cert.pem into output-dir (default: ./tls).
# Clients must trust cert.pem explicitly (e.g. curl --cacert, or add it to the OS trust store).
set -euo pipefail

OUT="${1:-./tls}"
HOST="${2:-localhost}"
DAYS="${3:-365}"

command -v openssl >/dev/null || { echo "error: openssl not found" >&2; exit 1; }

mkdir -p "$OUT"
SAN="DNS:${HOST},IP:127.0.0.1"
[[ "$HOST" =~ ^[0-9.]+$ ]] && SAN="IP:${HOST}"

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$OUT/key.pem" -out "$OUT/cert.pem" \
  -days "$DAYS" -subj "/CN=${HOST}" \
  -addext "subjectAltName=${SAN}" 2>/dev/null

chmod 600 "$OUT/key.pem"
echo "wrote $OUT/cert.pem and $OUT/key.pem (valid $DAYS days, SAN: $SAN)"
echo "serve with: uvicorn main:app --port 8443 --ssl-keyfile $OUT/key.pem --ssl-certfile $OUT/cert.pem"

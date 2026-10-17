#!/usr/bin/env bash
# Deploy one service folder to Cloud Run from source (Cloud Build builds its Dockerfile).
#
# Usage:
#   GCP_PROJECT=my-project servers/deploy.sh <service-dir> [--public] [--region REGION] [--dry-run]
#
# Examples:
#   GCP_PROJECT=my-project servers/deploy.sh services/hello
#   GCP_PROJECT=my-project servers/deploy.sh ../gcp-analysis --region europe-west1
#
# By default the service requires IAM authentication. Pass --public to allow
# unauthenticated access.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

SRC="${1:-}"
shift || true

PUBLIC=0
REGION="${GCP_REGION:-us-central1}"
DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --public) PUBLIC=1 ;;
    --region) REGION="${2:?--region needs a value}"; shift ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

if [[ -z "$SRC" ]]; then
  echo "usage: $0 <service-dir> [--public] [--region REGION] [--dry-run]" >&2
  exit 1
fi

# Resolve relative to the repo's servers/ folder first, then the current directory.
if [[ -d "$ROOT/$SRC" ]]; then
  SRC_DIR="$ROOT/$SRC"
elif [[ -d "$SRC" ]]; then
  SRC_DIR="$(cd "$SRC" && pwd)"
else
  echo "error: service directory not found: $SRC" >&2
  exit 1
fi

if [[ ! -f "$SRC_DIR/Dockerfile" ]]; then
  echo "error: $SRC_DIR has no Dockerfile" >&2
  exit 1
fi

SERVICE="$(basename "$SRC_DIR")"
PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" ]]; then
  echo "error: set GCP_PROJECT or run 'gcloud config set project ID'" >&2
  exit 1
fi

AUTH_FLAG="--no-allow-unauthenticated"
[[ $PUBLIC -eq 1 ]] && AUTH_FLAG="--allow-unauthenticated"

CMD=(gcloud run deploy "$SERVICE"
  --source "$SRC_DIR"
  --project "$PROJECT"
  --region "$REGION"
  "$AUTH_FLAG")

echo "service: $SERVICE  project: $PROJECT  region: $REGION  $AUTH_FLAG"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "dry run: ${CMD[*]}"
  exit 0
fi

"${CMD[@]}"

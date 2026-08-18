#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "CURSOR_API_KEY is required. Set it in .env or the environment." >&2
  exit 1
fi

if ! command -v zenflow >/dev/null 2>&1; then
  echo "zenflow is not installed. Install with:" >&2
  echo "  curl -fsSL https://zenflow.sh/install.sh | sh" >&2
  exit 1
fi

export COMPAT_BASE_URL="${COMPAT_BASE_URL:-http://127.0.0.1:8787/v1}"
export COMPAT_API_KEY="${COMPAT_API_KEY:-$CURSOR_API_KEY}"

MODEL="${1:-compat/composer-2.5-thinking}"

echo "Using COMPAT_BASE_URL=$COMPAT_BASE_URL"
echo "Running zenflow flow with model=$MODEL"
echo

zenflow flow zenflow/cursor-proxy-smoke.yaml \
  --model "$MODEL" \
  --verbose

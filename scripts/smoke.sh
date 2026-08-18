#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8787}"

if [[ -z "${CURSOR_API_KEY:-}" && -f .env ]]; then
  CURSOR_API_KEY="$(grep -E '^\s*CURSOR_API_KEY=' .env | tail -n1 | cut -d= -f2- | tr -d '\r')"
  export CURSOR_API_KEY
fi

if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "CURSOR_API_KEY is required" >&2
  exit 1
fi

echo "GET ${BASE_URL}/health"
curl -fsS "${BASE_URL}/health" | tee /dev/stderr >/dev/null
echo

echo "POST ${BASE_URL}/v1/chat/completions"
curl -fsS "${BASE_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${CURSOR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"composer-2.5","messages":[{"role":"user","content":"Reply with exactly: proxy-ok"}]}'
echo
echo "Smoke test passed."

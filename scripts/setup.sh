#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — set CURSOR_API_KEY before starting."
fi

if [[ "${1:-}" == "--docker" ]]; then
  if ! grep -Eq '^\s*CURSOR_API_KEY=\S+' .env; then
    echo "Set CURSOR_API_KEY in .env before running Docker setup." >&2
    exit 1
  fi

  docker compose build
  docker compose up -d
  PORT="$(grep -E '^\s*PORT=' .env | tail -n1 | cut -d= -f2- || true)"
  PORT="${PORT:-8787}"
  echo
  echo "Proxy running at http://127.0.0.1:${PORT}"
  echo "Health: curl http://127.0.0.1:${PORT}/health"
  echo "Logs:   docker compose logs -f"
  exit 0
fi

npm install
echo
echo "Local dev ready:"
echo "  npm run dev"
echo "  npm start"

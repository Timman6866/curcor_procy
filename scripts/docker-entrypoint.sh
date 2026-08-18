#!/bin/sh
set -eu

# Local tool runs need the Cursor agent executor on PATH. Mount the host
# install at /opt/cursor-agent (see docker-compose.yml).
if [ -d /opt/cursor-agent/versions ]; then
  agent_bin="$(ls -1 /opt/cursor-agent/versions/*/cursor-agent 2>/dev/null | head -n1 || true)"
  if [ -n "${agent_bin}" ] && [ -x "${agent_bin}" ]; then
    mkdir -p /app/.bin
    ln -sf "${agent_bin}" /app/.bin/agent
    export PATH="/app/.bin:${PATH}"
  fi
fi

exec node dist/index.js

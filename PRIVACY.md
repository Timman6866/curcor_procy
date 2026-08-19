# Privacy and logging policy

This proxy ships as two Docker images controlled by `LOG_POLICY`:

| Image tag | `LOG_POLICY` | Behavior |
| --- | --- | --- |
| `cursor-openai-proxy:standard` | `standard` (default) | Fastify access logs, in-memory admin request log, startup info |
| `cursor-openai-proxy:no-log` | `no-log` | No request metadata, no admin request log, no startup secrets on stdout |

## Standard image

The standard image logs:

- **Fastify access logs** to container stdout (method, URL, host, remote address, status)
- **In-memory request log** exposed in the admin UI **Request log** tab (method, path, status, timing)
- **Startup messages** including endpoint URLs and, when unset, a generated `CONNECT_AUTH_TOKEN` in plaintext

Docker's default `json-file` log driver retains stdout on disk unless you override it.

## No-log image

The no-log image disables:

- Fastify request logging (`logger: false`)
- The admin request-log hook and **Request log** tab
- Startup/shutdown info logs (silent bind)
- Printing or returning `CONNECT_AUTH_TOKEN` via admin APIs

Requirements:

- **`CONNECT_AUTH_TOKEN` must be set** before boot. Auto-generated tokens are not allowed because they would need to be logged or exposed somewhere.
- Use **`docker compose -f docker-compose.nolog.yml up`** (or `logging: driver: none`) so Docker does not retain stdout.

Build:

```bash
npm run docker:build:nolog
# or
docker build --build-arg LOG_POLICY=no-log -t cursor-openai-proxy:no-log .
```

Run (only one variant should bind port 8787 at a time):

```bash
CONNECT_AUTH_TOKEN=your-secret docker compose -f docker-compose.nolog.yml up -d
```

## What no-log does not cover

### Cursor SDK local runtime

When `CURSOR_RUNTIME=local`, `@cursor/sdk` may persist agent state (SQLite / JSONL) under `CURSOR_CWD` (`.scratch` or `/workspace`). That is outside this proxy's logging code.

Mitigations:

- Prefer **`CURSOR_RUNTIME=cloud`** for no-log deployments
- Use an ephemeral **`tmpfs`** volume for scratch/workspace if you must run local agents

### Settings at rest

`proxy-settings.json` stores admin overrides (API keys, tokens). It is not a request log, but it can contain secrets. The proxy writes it with mode `600`.

`proxy-usage.json` stores aggregate usage counters per API key (lifetime totals and daily rollups). It does not store request URLs, prompts, or responses. Retired keys keep their usage history after removal.

### Reverse proxy / host logs

Nginx, Traefik, NPM, or other ingress in front of this service may log client IPs, URLs, and TLS metadata. Configure those separately.

## Admin UI

The overview shows a **Logging policy** badge (`standard` or `no-log`). In no-log mode the connect token is not displayed in settings or status responses.

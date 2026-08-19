# cursor-openai-proxy

OpenAI-compatible REST server that forwards chat traffic to Cursor models through the official SDK. Point any OpenAI client at it — `openai`, Continue, Cline, LangChain, Hermes, curl.

It also exposes Cursor's official **`sdk.v1` Connect/protobuf** surface (the same wire contract as [`cursor-sdk-bridge`](https://github.com/cursor/sdk-bridge)), so non-TypeScript clients can speak native Cursor agent RPCs without embedding the SDK.

Cursor does not expose a raw `/v1/chat/completions` inference API. This proxy maps that contract onto Cursor SDK agent runs with the **full default tool suite** (read, edit, shell, grep, MCP, etc.) unless you restrict tools via env or Connect options.

## Tools

By default, agents get Cursor's full built-in toolset — the same capabilities as Agent mode in the IDE (`read`, `edit`, `grep`, `glob`, `shell`, `mcp`, `webSearch`, …).

| Control | Effect |
| --- | --- |
| `CURSOR_TOOLS=full` (default) | Full suite |
| `CURSOR_TOOLS=none` | Text-only (`tools: []`, **local only**) |
| `CURSOR_TOOLS=read,grep,shell` | Allowlist (**local only**) |
| Connect `CreateAgent` `options.tools.names` | Per-agent override (local only) |
| Connect `options.mcpServers` | Attach MCP servers to an agent |

Cloud agents always use Cursor's default cloud toolset — the SDK does not accept explicit `tools` arrays on cloud runs.

Tool activity appears on the Connect `Send` stream as `tool_call`, `thinking`, and `interactionUpdate` events. OpenAI REST can now return standard `tool_calls` when you pass a `tools` array (local runtime only); send `role: "tool"` messages on the follow-up request with the tool output.

## Two wire formats

| Surface | Protocol | Use when |
| --- | --- | --- |
| `/v1/*` | OpenAI REST | Existing OpenAI clients |
| `/sdk.v1.*` | Connect JSON over HTTP/1.1 | Native Cursor agent adapters |

**Important:** Cursor IDE chat uses a different, undocumented stack (`agent.v1` / `aiserver.v1` over HTTP/2 to `*.cursor.sh`). That is **not** what this server implements. The supported protobuf path is **`sdk.v1`** via the SDK / SDK bridge. See [Cursor SDK Bridge docs](https://cursor.com/docs/sdk/bridge).

Classic gRPC over HTTP/2 will not connect. Use plain JSON POSTs with `Content-Type: application/json`. Streaming `Send` responses are newline-delimited JSON (NDJSON).

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `GET` | `/v1/models` | Catalog from `Cursor.models.list()` |
| `POST` | `/v1/chat/completions` | Chat Completions, including `stream: true` |
| `POST` | `/v1/responses` | OpenAI Responses shape (Cursor BYOK often sends this) |
| `POST` | `/sdk.v1.SdkBridgeControlService/Ping` | Connect health |
| `POST` | `/sdk.v1.SdkCursorService/ListModels` | Model catalog |
| `POST` | `/sdk.v1.SdkAgentService/CreateAgent` | Create agent session |
| `POST` | `/sdk.v1.SdkAgentService/Send` | Streaming agent run (Connect framed) |
| `POST` | `/sdk.v1.SdkAgentService/CloseAgent` | Close agent session |

Connect RPCs require `Authorization: Bearer <CONNECT_AUTH_TOKEN>`. Cursor API keys go in the JSON body (`options.apiKey`) for catalog/agent calls, same as the official bridge.

## Setup

```bash
cp .env.example .env
# set CURSOR_API_KEY
npm install
npm start
```

Server listens on `http://127.0.0.1:8787`.

## Use it

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer $CURSOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "composer-2.5",
    "messages": [{"role": "user", "content": "Say hello in one sentence."}]
  }'
```

OpenAI SDK:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.CURSOR_API_KEY,
  baseURL: "http://127.0.0.1:8787/v1",
});

const res = await client.chat.completions.create({
  model: "composer-2.5",
  messages: [{ role: "user", content: "Hello" }],
});
```

Set `PROXY_API_KEY` to seed one proxy key from the environment, or create additional keys in **Admin → Settings**. Each key is shown once when generated; usage counters (requests and tokens) are tracked in memory and reset on restart.

## Proxy API keys and usage metering

When one or more proxy API keys are enabled, REST clients must send one as `Authorization: Bearer ...` or `x-api-key`. The admin UI lets you:

- **Generate** labeled keys (`POST /admin/api/proxy-keys`)
- **Remove** keys (`DELETE /admin/api/proxy-keys/:id`)
- View **ephemeral usage** per key (request count and token totals since last restart)

`PROXY_API_KEY` in `.env` seeds an environment key. Runtime keys are persisted to `proxy-settings.json`. Aggregate usage (lifetime, daily rollups, month-to-date) is persisted to `proxy-usage.json` in the same scratch directory. Removed keys keep their usage history. Per-key token quotas can be set in the admin UI.

Set `CONNECT_AUTH_TOKEN` to pin the Connect bridge bearer token; otherwise one is generated at startup and logged once (standard image only). The **no-log** image requires a pre-set token and never prints it.

## Logging policy (`LOG_POLICY`)

Two Docker images are supported:

| Image | Build | Logging |
| --- | --- | --- |
| `cursor-openai-proxy:standard` | `npm run docker:build:standard` | Fastify access logs, admin request log, startup info |
| `cursor-openai-proxy:no-log` | `npm run docker:build:nolog` | No request metadata, no admin request log, Docker `logging: none` |

```bash
npm run docker:build:all
```

- **Standard** (default): `docker compose up -d`
- **No-log**: set `CONNECT_AUTH_TOKEN` in `.env`, then `docker compose -f docker-compose.nolog.yml up -d`

Only one service should bind port `8787` at a time. See [PRIVACY.md](./PRIVACY.md) for details and SDK caveats.

## Connect example

```bash
# 1) Ping
curl -s http://127.0.0.1:8787/sdk.v1.SdkBridgeControlService/Ping \
  -H "Authorization: Bearer $CONNECT_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# 2) Create agent
curl -s http://127.0.0.1:8787/sdk.v1.SdkAgentService/CreateAgent \
  -H "Authorization: Bearer $CONNECT_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"options\":{\"model\":{\"id\":\"composer-2.5\"},\"apiKey\":\"$CURSOR_API_KEY\",\"local\":{\"cwd\":[\"$PWD/.scratch\"]}}}"

# 3) Send (streams NDJSON lines: sdkMessage, result, done)
curl -sN http://127.0.0.1:8787/sdk.v1.SdkAgentService/Send \
  -H "Authorization: Bearer $CONNECT_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$AGENT_ID\",\"message\":{\"text\":\"Say hello.\"}}"
```

## OpenAI function calling

Pass standard OpenAI `tools` on `/v1/chat/completions`. Requires **`CURSOR_RUNTIME=local`**.

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer $CURSOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "composer-2.5",
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather for a city",
        "parameters": {
          "type": "object",
          "properties": { "city": { "type": "string" } },
          "required": ["city"]
        }
      }
    }],
    "messages": [{ "role": "user", "content": "Weather in Boston?" }]
  }'
```

If the model chooses a tool, the response has `finish_reason: "tool_calls"` and a `tool_calls` array. Execute the function client-side, then continue:

```json
{
  "messages": [
    { "role": "user", "content": "Weather in Boston?" },
    { "role": "assistant", "tool_calls": [{ "...": "..." }] },
    { "role": "tool", "tool_call_id": "call_...", "content": "72F and sunny" }
  ],
  "tools": [{ "...": "..." }]
}
```

When `tools` is omitted, the proxy uses Cursor's built-in agent tools instead of OpenAI function calling.

## Model speed (Fast / Standard)

In Cursor, **plain `composer-2.5` is already the fast tier** (the product default). Standard is the unusual opt-in variant. Other model families may expose fast as a separate slug (e.g. `cursor-grok-4.5-high-fast`).

The proxy maps speed the same way as reasoning: model-id suffixes, request fields, or Cursor bracket syntax resolve to SDK `fast` params.

| Selector | Example | Effect |
| --- | --- | --- |
| Default (fast) | `composer-2.5` | Cursor fast tier; no `fast` param sent |
| Explicit fast slug | `composer-2.5-fast` | Same as base (`fast=true`) |
| Standard | `composer-2.5-standard` | Non-fast tier (`fast=false`) |
| Request field | `"fast": false` or `"model_speed": "standard"` | Forces standard on the resolved base model |
| Bracket syntax | `composer-2.5[fast=false]` | Same as Cursor subagent frontmatter |

`/v1/models` lists `-standard` and `-thinking` aliases for Composer bases (fast is already the default id). Other models also get `-fast` variants when applicable.

Combined example:

```json
{
  "model": "composer-2.5-thinking",
  "messages": [{ "role": "user", "content": "Plan this refactor" }]
}
```

That resolves to `composer-2.5` with `reasoning_effort=medium` on the default fast tier, and streams `reasoning_content` when the backend emits thinking deltas. Use `composer-2.5-standard-thinking` for standard + reasoning.

## Reasoning (selectable)

Reasoning is **off by default**. Enable it per request in any of these ways:

| Selector | Example | Effect |
| --- | --- | --- |
| Thinking model id | `composer-2.5-thinking` | Enables reasoning and streams `reasoning_content` |
| `reasoning_effort` | `"reasoning_effort": "high"` | Enables reasoning at the requested effort |
| Disable on thinking id | `"reasoning_effort": "none"` | Forces reasoning off even for `*-thinking` models |
| OpenAI-style body | `"reasoning": { "effort": "high" }` | Same as `reasoning_effort` |
| Anthropic-style body | `"thinking": { "type": "enabled" }` | Enables reasoning at medium effort |

Supported effort values are passed through to Cursor as `reasoning_effort` (`low`, `medium`, `high`, etc.). Use `none` / `off` / `false` to disable.

Under the hood, the proxy:

1. Parses the requested `model` id and body into `reasoning` + `fast` options (`src/model-variants.ts`).
2. Strips suffixes like `-thinking`, `-fast`, and `-standard` to get the base model id sent to the SDK.
3. Attaches SDK model params: `{ id: "reasoning_effort", value: "…" }` and/or `{ id: "fast", value: "true|false" }`.
4. Keeps the original requested id in API responses as `displayModel` so clients see what they asked for.
5. Streams `reasoning_content` chunks when reasoning is enabled (`src/server.ts`).

`/v1/models` lists both base and variant ids. OpenCode clients should declare `reasoning: true` and `interleaved.field: "reasoning_content"` on thinking model entries in `opencode.json`.

## Behavior

- OpenAI REST requests are one-shot agent runs. Send the full `messages` / `input` history each time.
- Agents use the full Cursor tool suite by default; set `CURSOR_TOOLS=none` for text-only local runs.
- Local runtime needs the Cursor agent executor on this machine. Use `CURSOR_RUNTIME=cloud` if you only have an API key.
- Token counts are passed through when the SDK reports them; otherwise they are `0`.

## Deploy

### Docker (recommended)

```bash
cp .env.example .env
# set CURSOR_API_KEY (required)

# Windows
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -Docker

# macOS / Linux
chmod +x scripts/setup.sh scripts/smoke.sh
./scripts/setup.sh --docker
```

Or manually:

```bash
docker compose up -d --build          # standard image
# or build both tags:
npm run docker:build:all

# strict no-log variant (requires CONNECT_AUTH_TOKEN in .env):
docker compose -f docker-compose.nolog.yml up -d --build
docker compose logs -f                # standard only; no-log uses logging driver none
```

The container listens on `0.0.0.0:8787`, uses **`CURSOR_RUNTIME=cloud` by default**, and persists scratch data in the `proxy-scratch` volume.

Smoke test after deploy:

```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1

# macOS / Linux
./scripts/smoke.sh
```

### Bare metal / VM

```bash
cp .env.example .env
npm install
npm run build:prod
npm run start:prod
```

Use `npm run dev` for local development with auto-reload.

### Point clients at the proxy

| Client | Setting |
| --- | --- |
| OpenAI SDK | `baseURL: "http://<host>:8787/v1"` |
| Continue / Cline | Override OpenAI base URL → `http://<host>:8787/v1` |
| Hermes / LangChain | OpenAI-compatible endpoint → same base URL |
| Connect adapters | `http://<host>:8787/sdk.v1.SdkAgentService/...` |

If you set `PROXY_API_KEY`, REST clients send that as `Authorization: Bearer ...`. Connect RPCs always use `CONNECT_AUTH_TOKEN` for the bridge bearer.

# cursor-openai-proxy

OpenAI-compatible REST server that forwards chat traffic to Cursor models through the official SDK. Point any OpenAI client at it — `openai`, Continue, Cline, LangChain, Hermes, curl.

It also exposes Cursor's official **`sdk.v1` Connect/protobuf** surface (the same wire contract as [`cursor-sdk-bridge`](https://github.com/cursor/sdk-bridge)), so non-TypeScript clients can speak native Cursor agent RPCs without embedding the SDK.

Cursor does not expose a raw `/v1/chat/completions` inference API. This proxy maps that contract onto local (or cloud) SDK agent runs with **no tools**, so the model can only return text.

## Two wire formats

| Surface | Protocol | Use when |
| --- | --- | --- |
| `/v1/*` | OpenAI REST | Existing OpenAI clients |
| `/sdk.v1.*` | Connect JSON over HTTP/1.1 | Native Cursor agent adapters |

**Important:** Cursor IDE chat uses a different, undocumented stack (`agent.v1` / `aiserver.v1` over HTTP/2 to `*.cursor.sh`). That is **not** what this server implements. The supported protobuf path is **`sdk.v1`** via the SDK / SDK bridge. See [Cursor SDK Bridge docs](https://cursor.com/docs/sdk/bridge).

Classic gRPC over HTTP/2 will not connect. Use Connect clients or framed `application/connect+json` POSTs.

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

Set `PROXY_API_KEY` if you want OpenAI REST clients to send a separate key from the Cursor credential.

Set `CONNECT_AUTH_TOKEN` to pin the Connect bridge bearer token; otherwise one is generated at startup and logged once.

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
```

## Behavior

- Each request is a one-shot run. Send the full `messages` / `input` history every time.
- Built-in tools are disabled (`tools: []`). The model cannot edit files or run shell.
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
docker compose up -d --build
docker compose logs -f
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

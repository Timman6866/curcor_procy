import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.ts";
import { connectStreamHeaders, ConnectTransformer, invokeConnectRpc } from "./transformer.ts";

const CONNECT_PATHS = [
  "/sdk.v1.SdkBridgeControlService/Ping",
  "/sdk.v1.SdkBridgeControlService/GetVersion",
  "/sdk.v1.SdkCursorService/Me",
  "/sdk.v1.SdkCursorService/ListModels",
  "/sdk.v1.SdkAgentService/CreateAgent",
  "/sdk.v1.SdkAgentService/CloseAgent",
  "/sdk.v1.SdkAgentService/Send",
] as const;

export function createConnectAuthToken(config: Config): string {
  return config.connectAuthToken ?? randomBytes(32).toString("base64url");
}

function requestBody(raw: unknown): Buffer | Record<string, unknown> {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") return Buffer.from(raw, "utf8");
  return {};
}

export function registerConnectGateway(app: FastifyInstance, config: Config, authToken: string) {
  const transformer = new ConnectTransformer(config, authToken);

  for (const path of CONNECT_PATHS) {
    app.post(path, async (request, reply) => {
      const rawBody = requestBody(request.body);

      if (path === "/sdk.v1.SdkAgentService/Send") {
        reply.hijack();
        reply.raw.writeHead(200, connectStreamHeaders());
        try {
          await invokeConnectRpc(
            transformer,
            path,
            request.headers.authorization,
            rawBody,
            (chunk) => {
              reply.raw.write(chunk);
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Stream failed";
          reply.raw.write(Buffer.from(`${JSON.stringify({ code: "internal", message })}\n`, "utf8"));
        } finally {
          reply.raw.end();
        }
        return reply;
      }

      const result = await invokeConnectRpc(
        transformer,
        path,
        request.headers.authorization,
        rawBody,
        () => {},
      );

      if ("stream" in result) {
        return;
      }

      return reply.headers(result.headers).code(200).send(result.body);
    });
  }

  return transformer;
}

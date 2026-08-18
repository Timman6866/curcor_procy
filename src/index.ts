import { config as loadEnv } from "dotenv";
import { loadConfig } from "./config.ts";
import { buildServer } from "./server.ts";

loadEnv();

const config = loadConfig();
const { app, connectAuthToken } = buildServer(config);

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down`);
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: config.host });
app.log.info(`OpenAI REST: http://${config.host}:${config.port}/v1`);
app.log.info(`Connect sdk.v1: http://${config.host}:${config.port}/sdk.v1.SdkAgentService/Send`);
if (!config.connectAuthToken) {
  app.log.info(`Connect bridge auth token (generated): ${connectAuthToken}`);
}

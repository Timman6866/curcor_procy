import { config as loadEnv } from "dotenv";
import { loadConfig } from "./config.ts";
import { ConfigStore } from "./config-store.ts";
import {
  getLogPolicy,
  startupLoggingEnabled,
  validateNoLogBootRequirements,
} from "./logging.ts";
import { buildServer } from "./server.ts";
import { flushUsageStore, initUsageStore } from "./usage-store.ts";

loadEnv();

const envConfig = loadConfig();
try {
  validateNoLogBootRequirements(envConfig.logPolicy, envConfig.connectAuthToken);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const configStore = ConfigStore.fromEnv(envConfig);
initUsageStore(configStore.getSettingsPath());
const config = configStore.get();
const { app } = buildServer(configStore);
const connectAuthToken = configStore.getConnectAuthToken();
const logPolicy = getLogPolicy();
const logStartup = startupLoggingEnabled(logPolicy);

const shutdown = async (signal: string) => {
  if (logStartup) {
    app.log.info(`Received ${signal}, shutting down`);
  }
  flushUsageStore();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: config.host });

if (logStartup) {
  app.log.info(`OpenAI REST: http://${config.host}:${config.port}/v1`);
  app.log.info(`Connect sdk.v1: http://${config.host}:${config.port}/sdk.v1.SdkAgentService/Send`);
  if (config.adminPassword) {
    app.log.info(`Admin UI: http://${config.host}:${config.port}/admin`);
  }
  if (!envConfig.connectAuthToken) {
    app.log.info(`Connect bridge auth token (generated): ${connectAuthToken}`);
  }
}

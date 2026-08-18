import type { Config } from "./config.ts";

export function buildAgentOptions(config: Config, apiKey: string, model: string) {
  return {
    apiKey,
    model: { id: model },
    tools: [] as [],
    ...(config.runtime === "cloud"
      ? { cloud: { repos: [] as [] } }
      : { local: { cwd: config.cwd, settingSources: [] as [] } }),
  };
}

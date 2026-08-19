export type LogPolicy = "standard" | "no-log";

let cachedPolicy: LogPolicy | undefined;

export function parseLogPolicy(value: string | undefined): LogPolicy {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "no-log" || normalized === "nolog" || normalized === "none") {
    return "no-log";
  }
  return "standard";
}

export function getLogPolicy(): LogPolicy {
  cachedPolicy ??= parseLogPolicy(process.env.LOG_POLICY);
  return cachedPolicy;
}

export function resetLogPolicyForTests(policy?: LogPolicy): void {
  cachedPolicy = policy;
}

export function isNoLogPolicy(policy: LogPolicy = getLogPolicy()): boolean {
  return policy === "no-log";
}

export function requestLoggingEnabled(policy: LogPolicy = getLogPolicy()): boolean {
  return policy === "standard";
}

export function fastifyLoggingEnabled(policy: LogPolicy = getLogPolicy()): boolean {
  return policy === "standard";
}

export function startupLoggingEnabled(policy: LogPolicy = getLogPolicy()): boolean {
  return policy === "standard";
}

export function validateNoLogBootRequirements(
  policy: LogPolicy,
  connectAuthTokenFromEnv: string | undefined,
): void {
  if (!isNoLogPolicy(policy)) return;
  if (connectAuthTokenFromEnv?.trim()) return;
  throw new Error(
    "LOG_POLICY=no-log requires CONNECT_AUTH_TOKEN to be set. Auto-generated tokens are not logged.",
  );
}

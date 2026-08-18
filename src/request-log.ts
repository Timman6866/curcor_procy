export interface RequestLogEntry {
  id: string;
  at: string;
  method: string;
  url: string;
  statusCode: number;
  responseTimeMs: number;
}

const MAX_ENTRIES = 100;
const entries: RequestLogEntry[] = [];
let counter = 0;

export function recordRequest(entry: Omit<RequestLogEntry, "id" | "at">): void {
  counter += 1;
  entries.unshift({
    id: String(counter),
    at: new Date().toISOString(),
    ...entry,
  });
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
}

export function listRequestLog(limit = 50): RequestLogEntry[] {
  return entries.slice(0, Math.min(limit, MAX_ENTRIES));
}

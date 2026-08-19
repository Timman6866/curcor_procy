export function parseDisabledModels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function filterModelIds(ids: string[], disabled: ReadonlySet<string>): string[] {
  if (disabled.size === 0) return ids;
  return ids.filter((id) => !disabled.has(id));
}

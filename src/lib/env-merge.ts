/** Applies a few changes to an environment without touching the other variables. Returns a new object. */
export function applyEnvChanges(
  current: Readonly<Record<string, string>>,
  changes: { set?: Readonly<Record<string, string>>; remove?: readonly string[] },
): Record<string, string> {
  const next: Record<string, string> = { ...current };
  for (const key of changes.remove ?? []) delete next[key];
  return { ...next, ...changes.set };
}

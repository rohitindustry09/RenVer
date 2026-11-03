/** Names of the environment variables whose value is exactly this database's connection string. */
export function variablesHoldingUrl(env: Record<string, string>, connectionUrl: string): string[] {
  return Object.entries(env)
    .filter(([, value]) => value === connectionUrl)
    .map(([key]) => key);
}

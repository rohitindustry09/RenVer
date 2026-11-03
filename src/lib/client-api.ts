import type { ApiResponse } from "./api";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return body.data;
}

export function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) throw new Error(`Invalid env line: "${line}". Use KEY=value.`);
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

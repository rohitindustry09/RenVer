import { isReservedEnvKey } from "./validate";

export interface EnvRow {
  key: string;
  value: string;
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function unquote(value: string): string {
  const first = value.charAt(0);
  const isQuoted = value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first);
  return isQuoted ? value.slice(1, -1) : value;
}

/** Parses pasted .env text. Lines without a key are skipped. */
export function parseEnvPaste(text: string): EnvRow[] {
  const rows: EnvRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    rows.push({ key: line.slice(0, eq).trim(), value: unquote(line.slice(eq + 1).trim()) });
  }
  return rows;
}

export function rowsToEnv(rows: readonly EnvRow[]): { env: Record<string, string>; error: string | null } {
  const env: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key && !row.value) continue;
    if (!key) return { env: {}, error: "Every value needs a name." };
    if (!KEY_PATTERN.test(key)) return { env: {}, error: `Invalid name "${key}". Use letters, numbers and underscores.` };
    if (isReservedEnvKey(key)) return { env: {}, error: `"${key}" is reserved and cannot be set.` };
    env[key] = row.value;
  }
  return { env, error: null };
}

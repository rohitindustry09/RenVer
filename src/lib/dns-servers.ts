/** DNS servers for one app's container, and spotting an app that cannot look up names. Client-safe and pure. */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Public resolvers that answer reliably. Used by the one-click fix. */
export const PUBLIC_DNS = ["1.1.1.1", "8.8.8.8"];
export const MAX_DNS_SERVERS = 3;

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:]{2,39}$/;

/** One address per line or comma (or an array). Empty means "use the server's own DNS". */
export function validateDnsServers(input: string | string[]): Checked<string[]> {
  const parts = (Array.isArray(input) ? input : input.split(/[\s,]+/)).map((p) => p.trim()).filter((p) => p !== "");
  const servers: string[] = [];
  for (const part of parts) {
    const isIp = IPV4.test(part) || (part.includes(":") && IPV6.test(part));
    if (!isIp) return { ok: false, error: `"${part}" is not an IP address. Use something like 1.1.1.1.` };
    if (!servers.includes(part)) servers.push(part);
  }
  if (servers.length > MAX_DNS_SERVERS) return { ok: false, error: `Use at most ${MAX_DNS_SERVERS} DNS servers.` };
  return { ok: true, value: servers };
}

const FAILURES: RegExp[] = [
  /\b(?:ENOTFOUND|EAI_AGAIN)\s+([A-Za-z0-9._-]+)/,
  /Could not resolve host:\s*([A-Za-z0-9._-]+)/i,
  /dial tcp: lookup ([A-Za-z0-9._-]+)[^\n]*(?:no such host|server misbehaving|i\/o timeout)/i,
  /Name or service not known|Temporary failure in name resolution|Failed to resolve/i,
];

/** The newest log line showing that the app could not look up a name, with the name when it is given. */
export function findDnsFailure(lines: readonly string[]): { host: string | null; line: string } | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    for (const pattern of FAILURES) {
      const match = pattern.exec(line);
      if (match) return { host: match[1] ?? null, line: line.trim().slice(0, 300) };
    }
  }
  return null;
}

/** An optional list of addresses allowed to reach the panel at all (RENVER_ALLOWED_IPS). Pure and Edge-safe. */

export type AllowRule = { kind: "v4"; network: number; mask: number } | { kind: "v6"; address: string };

export type ParsedAllowList = { ok: true; rules: AllowRule[] } | { ok: false; error: string };

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAPPED_PREFIX = "::ffff:";
const BITS = 32;

function ipv4ToNumber(text: string): number | null {
  const m = IPV4.exec(text);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

const isIpv6 = (text: string): boolean => text.includes(":") && /^[0-9a-f:.]+$/i.test(text);

/** "::ffff:1.2.3.4" is just 1.2.3.4 written the IPv6 way. */
function normalise(ip: string): string {
  const lower = ip.trim().toLowerCase();
  return lower.startsWith(MAPPED_PREFIX) ? lower.slice(MAPPED_PREFIX.length) : lower;
}

export function parseAllowList(text: string): ParsedAllowList {
  const rules: AllowRule[] = [];
  for (const entry of text.split(/[\s,]+/).filter(Boolean)) {
    const [address, prefix, extra] = entry.split("/");
    if (extra !== undefined) return { ok: false, error: `"${entry}" is not a valid address or range.` };
    const v4 = ipv4ToNumber(normalise(address!));
    if (v4 !== null) {
      const bits = prefix === undefined ? BITS : /^\d{1,2}$/.test(prefix) ? Number(prefix) : NaN;
      if (!(bits >= 0 && bits <= BITS)) return { ok: false, error: `"${entry}" has an invalid range size.` };
      const mask = bits === 0 ? 0 : (~0 << (BITS - bits)) >>> 0;
      rules.push({ kind: "v4", network: (v4 & mask) >>> 0, mask });
    } else if (prefix === undefined && isIpv6(address!)) {
      rules.push({ kind: "v6", address: address!.toLowerCase() });
    } else {
      return { ok: false, error: `"${entry}" is not a valid address or range.` };
    }
  }
  return { ok: true, rules };
}

const LOOPBACK_V4_FIRST_OCTET = 127;

/**
 * The machine itself (loopback, or no proxy header at all) is always let in, so a local panel cannot lock its owner out.
 * With an empty list everyone is let in.
 */
export function isIpAllowed(ip: string, rules: readonly AllowRule[]): boolean {
  if (rules.length === 0) return true;
  const address = normalise(ip);
  if (address === "direct" || address === "::1") return true;
  const v4 = ipv4ToNumber(address);
  if (v4 !== null && v4 >>> 24 === LOOPBACK_V4_FIRST_OCTET) return true;
  return rules.some((rule) => (rule.kind === "v4" ? v4 !== null && ((v4 & rule.mask) >>> 0) === rule.network : rule.address === address));
}

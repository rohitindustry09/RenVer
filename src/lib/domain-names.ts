/** Client-safe rules for domains and hostnames (no Node imports). */

import { isValidLabelSyntax, validateSubdomain } from "./subdomain";

export type Validated = { ok: true; value: string } | { ok: false; error: string };

export const CHALLENGE_LABEL = "_renver-challenge";

const MAX_DOMAIN_LENGTH = 253;
const MAX_SLUG_LENGTH = 48;
const MIN_TLD_LENGTH = 2;
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Trims and lowercases, and strips things people paste: a scheme, path, port, wildcard or trailing dot. */
export function normalizeDomainInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^\*\./, "")
    .replace(/\.$/, "");
}

export function isLocalDomain(name: string): boolean {
  return name === "localhost" || name.endsWith(".localhost");
}

export function validateDomainName(input: string): Validated {
  const value = normalizeDomainInput(input);
  const invalid = (error: string): Validated => ({ ok: false, error });

  if (!value) return invalid("Enter a domain, for example example.com.");
  if (value.length > MAX_DOMAIN_LENGTH) return invalid("That domain name is too long.");
  if (value === "localhost") return { ok: true, value };

  const labels = value.split(".");
  if (labels.length < 2) return invalid("Enter a full domain such as example.com.");
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) {
    return invalid("Use only letters, numbers and hyphens in each part of the domain.");
  }
  const tld = labels[labels.length - 1]!;
  if (tld.length < MIN_TLD_LENGTH || /^\d+$/.test(tld)) {
    return invalid("That does not look like a domain name (IP addresses are not supported).");
  }
  return { ok: true, value };
}

/** "" and "@" mean the root domain itself; otherwise one or more dot-separated labels. */
export function validateHostLabel(input: string): Validated {
  const value = input.trim().toLowerCase();
  if (value === "" || value === "@") return { ok: true, value: "" };

  if (!value.includes(".")) {
    const single = validateSubdomain(value);
    return single.ok ? { ok: true, value: single.value } : { ok: false, error: single.error };
  }
  const allValid = value.split(".").every(isValidLabelSyntax);
  return allValid
    ? { ok: true, value }
    : { ok: false, error: "Each part must use letters, numbers and hyphens, without starting or ending with a hyphen." };
}

export function buildHost(domain: string, label: string): string {
  return label ? `${label}.${domain}` : domain;
}

/** Local names are served over plain http; everything else gets https from Caddy. */
export function hostUrl(host: string): string {
  return `${isLocalDomain(host) ? "http" : "https"}://${host}`;
}

/** A short, DNS-safe, collision-resistant name for containers and images, derived from a host. */
export function hostSlug(host: string): string {
  const base = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base.length <= MAX_SLUG_LENGTH) return base;

  let hash = 0;
  for (const char of base) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return `${base.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "")}-${hash.toString(36).slice(0, 6)}`;
}

export function challengeHost(domain: string): string {
  return `${CHALLENGE_LABEL}.${domain}`;
}

export function challengeValue(token: string): string {
  return `renver-verify=${token}`;
}

/** DNS can split a long TXT value into chunks, so each record's chunks are joined before comparing. */
export function txtRecordsMatch(records: readonly (readonly string[])[], token: string): boolean {
  const expected = challengeValue(token);
  return records.some((chunks) => chunks.join("").trim() === expected);
}

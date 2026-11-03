import { randomBytes } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import {
  addProjectHost,
  createDomain,
  deleteDomain,
  getDomain,
  getDomainByName,
  getHostBinding,
  getProject,
  getProjectBySubdomain,
  getSetting,
  listHostsForDomain,
  listProjectHosts,
  markDomainVerified,
  removeProjectHost,
  setSetting,
  type DomainRecord,
} from "./db";
import { assessDns, type DnsAssessment } from "./dns-check";
import {
  buildHost,
  challengeHost,
  challengeValue,
  hostSlug,
  isLocalDomain,
  txtRecordsMatch,
  validateDomainName,
  validateHostLabel,
} from "./domain-names";

export class DomainError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

export type TxtResolver = (host: string) => Promise<string[][]>;
export type AddressLookup = (host: string) => Promise<string[]>;

const SERVER_IP_KEY = "server_ip";
const TOKEN_BYTES = 16;
/** Resolver codes that mean "this record does not exist", as opposed to "DNS itself failed". */
const NO_RECORD_CODES = new Set(["ENOTFOUND", "ENODATA"]);
const WILDCARD_PROBE_LABEL = "renver-dns-check";

export function addDomain(input: string): DomainRecord {
  const name = validateDomainName(input);
  if (!name.ok) throw new DomainError(name.error);
  if (getDomainByName(name.value)) throw new DomainError("That domain has already been added.", 409);
  return createDomain({
    name: name.value,
    token: randomBytes(TOKEN_BYTES).toString("hex"),
    // .localhost names cannot be owned by anyone else, so there is nothing to prove.
    status: isLocalDomain(name.value) ? "verified" : "pending",
  });
}

/** Public resolvers used when the machine's own DNS settings cannot answer (common in containers and VPNs). */
const PUBLIC_RESOLVERS = ["1.1.1.1", "8.8.8.8"];
const PUBLIC_RESOLVER_TIMEOUT_MS = 5000;

async function resolveTxtViaPublicDns(host: string): Promise<string[][]> {
  const resolver = new dns.Resolver({ timeout: PUBLIC_RESOLVER_TIMEOUT_MS, tries: 2 });
  resolver.setServers(PUBLIC_RESOLVERS);
  return resolver.resolveTxt(host);
}

/**
 * Asks the system resolver first. A real "no such record" answer is trusted as is; only when the
 * resolver itself fails (refused, timed out) does it retry through public DNS.
 */
export function resilientTxtResolver(primary: TxtResolver, fallback: TxtResolver): TxtResolver {
  return async (host) => {
    try {
      return await primary(host);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && NO_RECORD_CODES.has(code)) throw error;
      return fallback(host);
    }
  };
}

const defaultTxtResolver = resilientTxtResolver((host) => dns.resolveTxt(host), resolveTxtViaPublicDns);

export interface VerifyResult {
  verified: boolean;
  message: string;
}

/** Ownership check: the owner must publish the domain's token in a TXT record under _renver-challenge. */
export async function verifyDomain(id: string, resolveTxt: TxtResolver = defaultTxtResolver): Promise<VerifyResult> {
  const domain = getDomain(id);
  if (!domain) throw new DomainError("Domain not found.", 404);
  if (domain.status === "verified") return { verified: true, message: "This domain is already verified." };

  const host = challengeHost(domain.name);
  let records: string[][];
  try {
    records = await resolveTxt(host);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!code || !NO_RECORD_CODES.has(code)) {
      return { verified: false, message: `Could not reach DNS to check ${host} (${code ?? "error"}). Try again in a moment.` };
    }
    records = [];
  }

  if (txtRecordsMatch(records, domain.token)) {
    markDomainVerified(id);
    return { verified: true, message: "Ownership verified." };
  }
  return {
    verified: false,
    message: `No TXT record at ${host} with the value ${challengeValue(domain.token)} yet. DNS changes can take a few minutes.`,
  };
}

export function removeDomain(id: string): void {
  if (!getDomain(id)) throw new DomainError("Domain not found.", 404);
  const inUse = listHostsForDomain(id).length;
  if (inUse > 0) {
    throw new DomainError(`${inUse} address${inUse === 1 ? " is" : "es are"} still in use on this domain. Remove them first.`, 409);
  }
  deleteDomain(id);
}

/** The IP the admin set (if any), then this machine's own non-internal IPv4 addresses. */
export function serverAddresses(): string[] {
  const configured = getSetting(SERVER_IP_KEY);
  const detected = Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => i !== undefined && !i.internal && i.family === "IPv4")
    .map((i) => i.address);
  return [...(configured ? [configured] : []), ...detected.filter((a) => a !== configured)];
}

/** Saves the public IP shown in DNS instructions. An empty value clears it. */
export function setServerIp(value: string): string | null {
  const ip = value.trim();
  if (!ip) {
    setSetting(SERVER_IP_KEY, null);
    return null;
  }
  if (!net.isIP(ip)) throw new DomainError("Enter a valid IPv4 or IPv6 address.");
  setSetting(SERVER_IP_KEY, ip);
  return ip;
}

export interface DnsCheck extends DnsAssessment {
  name: string;
  addresses: string[];
}

async function resolveAddresses(host: string): Promise<string[]> {
  try {
    return (await dns.lookup(host, { all: true })).map((a) => a.address);
  } catch {
    return [];
  }
}

/** Checks that the domain itself, and any subdomain, resolve to this server. */
export async function checkDomainDns(
  domain: DomainRecord,
  lookup: AddressLookup = resolveAddresses,
): Promise<{ root: DnsCheck; wildcard: DnsCheck }> {
  const known = [
    ...serverAddresses(),
    ...Object.values(os.networkInterfaces()).flat().filter((i) => i !== undefined).map((i) => i!.address),
  ];
  const mode = isLocalDomain(domain.name) ? "local" : "production";
  const check = async (name: string, recordName: string): Promise<DnsCheck> => {
    const addresses = await lookup(name);
    return { name, addresses, ...assessDns({ baseDomain: domain.name, mode, addresses, localAddresses: known, recordName }) };
  };
  return {
    root: await check(domain.name, domain.name),
    wildcard: await check(`${WILDCARD_PROBE_LABEL}.${domain.name}`, `*.${domain.name}`),
  };
}

export interface HostPlan {
  domain: DomainRecord;
  host: string;
}

/** Validates a domain + label into a hostname that is allowed and free. Throws a DomainError otherwise. */
export function planProjectHost(domainId: string, label: string): HostPlan {
  const domain = getDomain(domainId);
  if (!domain) throw new DomainError("Domain not found.", 404);
  if (domain.status !== "verified") {
    throw new DomainError(`Verify ownership of ${domain.name} before using it.`, 409);
  }
  const parsed = validateHostLabel(label);
  if (!parsed.ok) throw new DomainError(parsed.error);

  const host = buildHost(domain.name, parsed.value);
  if (getHostBinding(host)) throw new DomainError(`${host} is already in use.`, 409);
  return { domain, host };
}

/** A project name that is unique across projects, derived from its hostname. */
export function uniqueSlug(host: string): string {
  const base = hostSlug(host);
  let candidate = base;
  for (let n = 2; getProjectBySubdomain(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

export function addHostToProject(projectId: string, domainId: string, label: string): string {
  if (!getProject(projectId)) throw new DomainError("Project not found.", 404);
  const { domain, host } = planProjectHost(domainId, label);
  addProjectHost({ host, projectId, domainId: domain.id });
  return host;
}

export function removeHostFromProject(projectId: string, host: string): void {
  const hosts = listProjectHosts(projectId);
  if (!hosts.some((h) => h.host === host)) throw new DomainError("Hostname not found on this project.", 404);
  if (hosts.length <= 1) throw new DomainError("A project needs at least one address.", 409);
  removeProjectHost(projectId, host);
}

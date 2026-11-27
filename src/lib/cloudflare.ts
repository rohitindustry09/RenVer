import { CloudflareError, type CloudflareClient } from "./cloudflare-api";
import { belongsTo, buildIngress, planDns, type TrackedRecord } from "./cloudflare-plan";

export interface CloudflareStore {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

interface DomainsPort {
  get(id: string): { id: string; name: string; isLocal: boolean } | null;
  hosts(domainId: string): string[];
  runningRoutes(): { hosts: string[]; port: number }[];
  markVerified(id: string): void;
}

interface RunnerPort {
  start(token: string): void;
  stop(): void;
  state(): { running: boolean; connected: boolean; error: string | null };
}

interface Deps {
  store: CloudflareStore;
  client: (token: string) => CloudflareClient;
  runner: RunnerPort;
  domains: DomainsPort;
  encrypt: (value: Record<string, string>) => string | null;
  decrypt: (stored: string | null) => Record<string, string>;
}

export interface SyncResult {
  skipped?: boolean;
  errors: string[];
}

interface Tunnel {
  accountId: string;
  tunnelId: string;
  runToken: string;
}

const TOKEN_KEY = "cf:token";
const TUNNEL_KEY = "cf:tunnel";
const ZONES_KEY = "cf:zones";
const RECORDS_KEY = "cf:records";
const TUNNEL_NAME = "renver";
const isNameTaken = (error: unknown): boolean => error instanceof Error && /already have a tunnel/i.test(error.message);
const tunnelTarget = (tunnelId: string): string => `${tunnelId}.cfargotunnel.com`;
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Serves domains from this computer through a Cloudflare tunnel. The owner gives RenVer an API token once; RenVer then
 * keeps a tunnel running and, for every address on a connected domain, adds the DNS record and the tunnel rule.
 */
export function createCloudflareService(deps: Deps) {
  const { store, domains } = deps;
  let queue: Promise<unknown> = Promise.resolve();

  const readJson = <T>(key: string, fallback: T): T => {
    const raw = store.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  };
  const readToken = (): string | null => deps.decrypt(store.get(TOKEN_KEY)).token ?? null;
  const readTunnel = (): Tunnel | null => {
    const t = deps.decrypt(store.get(TUNNEL_KEY));
    return t.tunnelId && t.accountId && t.runToken ? { accountId: t.accountId, tunnelId: t.tunnelId, runToken: t.runToken } : null;
  };
  const readZones = (): Record<string, string> => readJson(ZONES_KEY, {});
  const readRecords = (): Record<string, TrackedRecord> => readJson(RECORDS_KEY, {});

  function connectedDomains(): { id: string; name: string; zoneId: string }[] {
    return Object.entries(readZones()).flatMap(([id, zoneId]) => {
      const domain = domains.get(id);
      return domain ? [{ id, name: domain.name, zoneId }] : [];
    });
  }

  function requireToken(): string {
    const token = readToken();
    if (!token) throw new CloudflareError("Add your Cloudflare API token first.", 400);
    return token;
  }

  async function ensureRecord(client: CloudflareClient, zoneId: string, host: string, tunnelId: string): Promise<string> {
    const target = tunnelTarget(tunnelId);
    const existing = await client.listRecords(zoneId, host);
    const first = existing[0];
    if (!first) return client.createCname(zoneId, host, target);
    if (first.type === "CNAME" && first.content === target) return first.id;
    throw new CloudflareError(`${host} already has a ${first.type} record in Cloudflare. Remove it there first; RenVer does not overwrite records it did not create.`, 409);
  }

  async function runSync(): Promise<SyncResult> {
    const token = readToken();
    const tunnel = readTunnel();
    const cfDomains = connectedDomains();
    if (!token || !tunnel || cfDomains.length === 0) return { skipped: true, errors: [] };

    const client = deps.client(token);
    const errors: string[] = [];
    const owner = (host: string) => cfDomains.find((d) => belongsTo(host, d.name));

    const routes = domains.runningRoutes().flatMap((r) => r.hosts.filter((h) => owner(h)).map((host) => ({ host, port: r.port })));
    try {
      await client.putIngress(tunnel.accountId, tunnel.tunnelId, buildIngress(routes));
    } catch (error) {
      errors.push(message(error));
    }

    const tracked = readRecords();
    const plan = planDns(cfDomains.flatMap((d) => domains.hosts(d.id)), tracked);
    for (const host of plan.create) {
      const zoneId = owner(host)?.zoneId;
      if (!zoneId) continue;
      try {
        tracked[host] = { zoneId, recordId: await ensureRecord(client, zoneId, host, tunnel.tunnelId) };
      } catch (error) {
        errors.push(message(error));
      }
    }
    for (const host of plan.remove) {
      const record = tracked[host];
      if (!record) continue;
      try {
        await client.deleteRecord(record.zoneId, record.recordId);
        delete tracked[host];
      } catch (error) {
        errors.push(`Could not remove the DNS record for ${host}: ${message(error)}`);
      }
    }
    store.set(RECORDS_KEY, JSON.stringify(tracked));
    return { errors };
  }

  /** One sync at a time: deploys and the watchdog can ask at the same moment. */
  function sync(): Promise<SyncResult> {
    const next = queue.then(runSync, runSync);
    queue = next.catch(() => undefined);
    return next;
  }

  /** Makes the tunnel, or takes over the one already named "renver" in this account (its routes are then replaced by RenVer's). */
  async function createOrAdoptTunnel(client: CloudflareClient, accountId: string): Promise<string> {
    try {
      return await client.createTunnel(accountId, TUNNEL_NAME);
    } catch (error) {
      if (!isNameTaken(error)) throw error;
      const existing = await client.findTunnel(accountId, TUNNEL_NAME);
      if (!existing) throw error;
      return existing;
    }
  }

  async function ensureTunnel(client: CloudflareClient, accountId: string): Promise<Tunnel> {
    const existing = readTunnel();
    if (existing) {
      if (existing.accountId !== accountId) {
        throw new CloudflareError("This domain is on a different Cloudflare account than the tunnel RenVer already made. Use a token for one account.", 409);
      }
      return existing;
    }
    const tunnelId = await createOrAdoptTunnel(client, accountId);
    const runToken = await client.getTunnelToken(accountId, tunnelId);
    const tunnel = { accountId, tunnelId, runToken };
    store.set(TUNNEL_KEY, deps.encrypt(tunnel));
    return tunnel;
  }

  return {
    sync,

    async saveToken(raw: string): Promise<void> {
      const token = raw.trim();
      if (!token) throw new CloudflareError("Paste your Cloudflare API token.", 400);
      await deps.client(token).verifyToken();
      store.set(TOKEN_KEY, deps.encrypt({ token }));
    },

    /** Proves ownership through Cloudflare itself (an active zone in the owner's account), then serves the domain. */
    async connectDomain(domainId: string): Promise<SyncResult> {
      const token = requireToken();
      const domain = domains.get(domainId);
      if (!domain) throw new CloudflareError("Domain not found.", 404);
      if (domain.isLocal) throw new CloudflareError("Local domains do not need Cloudflare.", 400);

      const client = deps.client(token);
      const zone = await client.findZone(domain.name);
      if (!zone) {
        throw new CloudflareError(`${domain.name} is not on this Cloudflare account. Add it as a site in Cloudflare first, then try again.`, 404);
      }
      if (zone.status !== "active") {
        throw new CloudflareError(
          `Cloudflare is not serving ${domain.name} yet (${zone.status}). At your registrar, set the nameservers to ${zone.nameServers.join(" and ")}, wait until Cloudflare shows the site as Active, then try again.`,
          409,
        );
      }
      const tunnel = await ensureTunnel(client, zone.accountId);
      store.set(ZONES_KEY, JSON.stringify({ ...readZones(), [domainId]: zone.id }));
      domains.markVerified(domainId);
      deps.runner.start(tunnel.runToken);
      return sync();
    },

    /** Starts the tunnel again after the panel restarts. */
    async resume(): Promise<void> {
      const tunnel = readTunnel();
      if (!tunnel || connectedDomains().length === 0) return;
      deps.runner.start(tunnel.runToken);
      await sync();
    },

    isCloudflareDomain: (domainId: string): boolean => domainId in readZones(),

    /** Running apps' routes for Caddy, without the hostnames Cloudflare serves (Caddy must not chase certificates for them). */
    proxyRoutes(): { hosts: string[]; port: number }[] {
      const names = connectedDomains().map((d) => d.name);
      return domains
        .runningRoutes()
        .map((r) => ({ ...r, hosts: r.hosts.filter((h) => !names.some((n) => belongsTo(h, n))) }))
        .filter((r) => r.hosts.length > 0);
    },

    status() {
      const runner = deps.runner.state();
      return {
        hasToken: readToken() !== null,
        tunnel: readTunnel() !== null,
        running: runner.running,
        connected: runner.connected,
        error: runner.error,
        domainIds: Object.keys(readZones()),
      };
    },

    /** Stops the tunnel and removes what RenVer made in Cloudflare. Errors are reported, never fatal: the local state is cleared anyway. */
    async disconnect(): Promise<string[]> {
      const errors: string[] = [];
      deps.runner.stop();
      const token = readToken();
      const tunnel = readTunnel();
      if (token) {
        const client = deps.client(token);
        for (const [host, record] of Object.entries(readRecords())) {
          await client.deleteRecord(record.zoneId, record.recordId).catch((e: unknown) => void errors.push(`${host}: ${message(e)}`));
        }
        if (tunnel) await client.deleteTunnel(tunnel.accountId, tunnel.tunnelId).catch((e: unknown) => void errors.push(`tunnel: ${message(e)}`));
      }
      for (const key of [TOKEN_KEY, TUNNEL_KEY, ZONES_KEY, RECORDS_KEY]) store.set(key, null);
      return errors;
    },
  };
}

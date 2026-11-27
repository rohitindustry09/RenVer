const BASE = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 20_000;
const MANAGED_COMMENT = "Managed by RenVer";

export class CloudflareError extends Error {
  constructor(message: string, readonly status: number = 502) {
    super(message);
  }
}

export interface Zone {
  id: string;
  name: string;
  status: string;
  accountId: string;
  nameServers: string[];
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

export interface IngressRule {
  hostname?: string;
  service: string;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface Envelope<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

interface RawZone {
  id: string;
  name: string;
  status: string;
  account: { id: string };
  name_servers?: string[];
}

/** A small client for the parts of Cloudflare's API that RenVer needs: zones, tunnels and DNS records. */
export function createCloudflareClient(token: string, fetchImpl: Fetch = fetch) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new CloudflareError("Could not reach Cloudflare. Check this computer's internet connection.", 502);
    }
    const body = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (response.ok && body?.success) return body.result;

    const detail = body?.errors?.[0]?.message ?? `HTTP ${response.status}`;
    const isAuth = response.status === 401 || response.status === 403;
    throw new CloudflareError(
      isAuth ? `Cloudflare refused the request (${detail}). Check that the token has the permissions listed above.` : `Cloudflare: ${detail}`,
      isAuth ? 400 : 502,
    );
  }

  const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    async verifyToken(): Promise<void> {
      const result = await call<{ status: string }>("/user/tokens/verify");
      if (result.status !== "active") throw new CloudflareError(`This token is not active (${result.status}).`, 400);
    },

    async findZone(name: string): Promise<Zone | null> {
      const zones = await call<RawZone[]>(`/zones?name=${encodeURIComponent(name)}`);
      const zone = zones[0];
      if (!zone) return null;
      return { id: zone.id, name: zone.name, status: zone.status, accountId: zone.account.id, nameServers: zone.name_servers ?? [] };
    },

    async createTunnel(accountId: string, name: string): Promise<string> {
      const tunnel = await call<{ id: string }>(`/accounts/${accountId}/cfd_tunnel`, send("POST", { name, config_src: "cloudflare" }));
      return tunnel.id;
    },

    /** The id of the live tunnel with this name, or null. */
    async findTunnel(accountId: string, name: string): Promise<string | null> {
      const tunnels = await call<{ id: string }[]>(`/accounts/${accountId}/cfd_tunnel?name=${encodeURIComponent(name)}&is_deleted=false`);
      return tunnels[0]?.id ?? null;
    },

    getTunnelToken: (accountId: string, tunnelId: string) => call<string>(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`),

    async deleteTunnel(accountId: string, tunnelId: string): Promise<void> {
      await call(`/accounts/${accountId}/cfd_tunnel/${tunnelId}`, send("DELETE"));
    },

    async putIngress(accountId: string, tunnelId: string, ingress: IngressRule[]): Promise<void> {
      await call(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, send("PUT", { config: { ingress } }));
    },

    listRecords: (zoneId: string, name: string) => call<DnsRecord[]>(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}`),

    async createCname(zoneId: string, name: string, content: string): Promise<string> {
      const record = await call<{ id: string }>(
        `/zones/${zoneId}/dns_records`,
        send("POST", { type: "CNAME", name, content, proxied: true, ttl: 1, comment: MANAGED_COMMENT }),
      );
      return record.id;
    },

    async deleteRecord(zoneId: string, recordId: string): Promise<void> {
      await call(`/zones/${zoneId}/dns_records/${recordId}`, send("DELETE"));
    },
  };
}

export type CloudflareClient = ReturnType<typeof createCloudflareClient>;

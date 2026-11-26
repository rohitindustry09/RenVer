export interface DomainItem {
  id: string;
  name: string;
  status: "pending" | "verified";
  isLocal: boolean;
  /** Served through the Cloudflare tunnel, so no DNS records need adding by hand. */
  viaCloudflare: boolean;
  verifiedAt: string | null;
  createdAt: string;
  /** Hostnames of projects that use this domain. */
  hosts: string[];
  /** The TXT record that proves ownership. */
  txt: { name: string; value: string };
}

export interface DomainsPayload {
  domains: DomainItem[];
  mode: "local" | "production";
  serverAddresses: string[];
  configuredServerIp: string | null;
  proxy: { running: boolean };
  cloudflare: CloudflareStatus;
}

export interface CloudflareStatus {
  hasToken: boolean;
  tunnel: boolean;
  running: boolean;
  connected: boolean;
  error: string | null;
  domainIds: string[];
}

export const isUsable = (domain: DomainItem): boolean => domain.status === "verified";

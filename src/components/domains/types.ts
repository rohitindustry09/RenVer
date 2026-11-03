export interface DomainItem {
  id: string;
  name: string;
  status: "pending" | "verified";
  isLocal: boolean;
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
}

export const isUsable = (domain: DomainItem): boolean => domain.status === "verified";

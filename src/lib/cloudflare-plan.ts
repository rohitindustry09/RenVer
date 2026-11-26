import type { IngressRule } from "./cloudflare-api";

export interface TrackedRecord {
  zoneId: string;
  recordId: string;
}

/** Whether `host` is the domain itself or one of its subdomains. */
export const belongsTo = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);

/** Tunnel rules: each running app's hostnames go to its local port; anything else gets a 404. */
export function buildIngress(routes: { host: string; port: number }[]): IngressRule[] {
  const byHost = new Map<string, number>();
  for (const { host, port } of routes) if (!byHost.has(host)) byHost.set(host, port);
  const rules = [...byHost.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hostname, port]) => ({ hostname, service: `http://127.0.0.1:${port}` }));
  return [...rules, { service: "http_status:404" }];
}

/** Which DNS records to add and which of RenVer's own records to remove so Cloudflare matches the wanted hosts. */
export function planDns(desiredHosts: string[], tracked: Record<string, TrackedRecord>): { create: string[]; remove: string[] } {
  const desired = new Set(desiredHosts);
  return {
    create: [...desired].filter((host) => !(host in tracked)),
    remove: Object.keys(tracked).filter((host) => !desired.has(host)),
  };
}

import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { isCaddyRunning } from "@/lib/caddy";
import { config } from "@/lib/config";
import { listDomains, listHostsForDomain, getSetting } from "@/lib/db";
import { challengeHost, challengeValue, isLocalDomain } from "@/lib/domain-names";
import { addDomain, serverAddresses } from "@/lib/domains";
import { cloudflare } from "@/lib/cloudflare-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tunnel = cloudflare();
  const domains = listDomains().map((d) => {
    const hosts = listHostsForDomain(d.id).map((h) => h.host);
    return {
      id: d.id,
      name: d.name,
      status: d.status,
      isLocal: isLocalDomain(d.name),
      viaCloudflare: tunnel.isCloudflareDomain(d.id),
      verifiedAt: d.verifiedAt,
      createdAt: d.createdAt,
      hosts,
      txt: { name: challengeHost(d.name), value: challengeValue(d.token) },
    };
  });
  return ok({
    domains,
    mode: config.mode,
    serverAddresses: serverAddresses(),
    configuredServerIp: getSetting("server_ip"),
    proxy: { running: await isCaddyRunning() },
    cloudflare: tunnel.status(),
  });
}

async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown };
    const domain = addDomain(typeof body.name === "string" ? body.name : "");
    return ok({ id: domain.id, name: domain.name, status: domain.status }, 201);
  } catch (error) {
    return failFrom(error);
  }
}

export const POST = audited("domain.add", handlePOST, { detail: (b) => (typeof b.name === "string" ? b.name : undefined) });

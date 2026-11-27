import { createCloudflareClient } from "./cloudflare-api";
import { createCloudflareService } from "./cloudflare";
import { cloudflaredRunner } from "./cloudflared-run";
import { getDomain, getSetting, listHostsForDomain, listRunningRoutes, markDomainVerified, setSetting } from "./db";
import { isLocalDomain } from "./domain-names";
import { config } from "./config";
import { adminPassword } from "./login";
import { getPanelHost } from "./panel-host";
import { decryptEnv, encryptEnv } from "./secrets";

type Service = ReturnType<typeof createCloudflareService>;

/** One service per process, kept on globalThis so every loaded copy of this module shares the same sync queue. */
const globalKey = Symbol.for("renver.cloudflare");
type Holder = { [globalKey]?: Service };

/** The Cloudflare tunnel service wired to RenVer's database, encryption key and cloudflared process. */
export function cloudflare(): Service {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createCloudflareService({
    store: { get: getSetting, set: setSetting },
    client: (token) => createCloudflareClient(token),
    runner: cloudflaredRunner(),
    domains: {
      get: (id) => {
        const domain = getDomain(id);
        return domain ? { id: domain.id, name: domain.name, isLocal: isLocalDomain(domain.name) } : null;
      },
      hosts: (domainId) => listHostsForDomain(domainId).map((h) => h.host),
      runningRoutes: listRunningRoutes,
      markVerified: markDomainVerified,
    },
    panel: { host: getPanelHost, port: () => config.panelPort, isProtected: () => adminPassword() !== undefined },
    encrypt: encryptEnv,
    decrypt: decryptEnv,
  });
  return holder[globalKey];
}

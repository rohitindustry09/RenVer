import { audited } from "@/lib/audited";
import { fail, failFrom, ok } from "@/lib/api";
import { getProject, listProjectHosts, updateProjectEnv } from "@/lib/db";
import { retargetAppUrls } from "@/lib/env-urls";
import { decryptEnv, encryptEnv } from "@/lib/secrets";
import { syncProxy } from "@/lib/deploy";
import { addHostToProject, removeHostFromProject, replaceProjectHost } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Adds another address (a subdomain, or the root domain itself) that reaches this project. */
async function handlePOST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { domainId?: unknown; label?: unknown };
    const host = addHostToProject(id, String(body.domainId ?? ""), typeof body.label === "string" ? body.label : "");
    await syncProxy(() => undefined);
    return ok({ host, hosts: listProjectHosts(id).map((h) => h.host) }, 201);
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * Body: `{ "oldHost": "a.example.com", "domainId": "…", "label": "b" }`. Swaps one address for another. Address variables
 * (like SHOPIFY_APP_URL) that held the old address are pointed at the new one; the app picks that up on its next deploy.
 */
async function handlePUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { oldHost?: unknown; domainId?: unknown; label?: unknown };
    const oldHost = String(body.oldHost ?? "");
    const host = replaceProjectHost(id, oldHost, String(body.domainId ?? ""), typeof body.label === "string" ? body.label : "");

    let updatedEnv: string[] = [];
    const project = getProject(id);
    if (project?.envEncrypted) {
      const retargeted = retargetAppUrls(decryptEnv(project.envEncrypted), oldHost, host);
      if (retargeted.changed.length > 0) {
        updateProjectEnv(id, encryptEnv(retargeted.env));
        updatedEnv = retargeted.changed;
      }
    }
    await syncProxy(() => undefined);
    return ok({ host, hosts: listProjectHosts(id).map((x) => x.host), updatedEnv });
  } catch (error) {
    return failFrom(error);
  }
}

async function handleDELETE(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const host = new URL(request.url).searchParams.get("host");
    if (!host) return fail("Say which address to remove.");
    removeHostFromProject(id, host);
    await syncProxy(() => undefined);
    return ok({ hosts: listProjectHosts(id).map((h) => h.host) });
  } catch (error) {
    return failFrom(error);
  }
}

export const POST = audited("project.host.add", handlePOST, { detail: (b) => (typeof b.label === "string" ? b.label || "(root domain)" : undefined) });

export const DELETE = audited("project.host.remove", handleDELETE, { detail: (_b, { url }) => url.searchParams.get("host") ?? undefined });

export const PUT = audited("project.host.change", handlePUT, { detail: (b) => (typeof b.oldHost === "string" ? `from ${b.oldHost}` : undefined) });

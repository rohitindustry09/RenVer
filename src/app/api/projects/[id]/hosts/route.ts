import { audited } from "@/lib/audited";
import { fail, failFrom, ok } from "@/lib/api";
import { listProjectHosts } from "@/lib/db";
import { syncProxy } from "@/lib/deploy";
import { addHostToProject, removeHostFromProject } from "@/lib/domains";

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

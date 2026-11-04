import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { getProject, updateProjectDns } from "@/lib/db";
import { validateDnsServers } from "@/lib/dns-servers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: `{ "servers": ["1.1.1.1", "8.8.8.8"] }`, or an empty list for the server's own DNS. Applies on the next deploy. */
async function handlePUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const project = getProject((await params).id);
    if (!project) return failFrom(Object.assign(new Error("Project not found."), { status: 404 }));
    const body = (await request.json()) as { servers?: unknown };
    const checked = validateDnsServers(Array.isArray(body.servers) ? body.servers.map(String) : String(body.servers ?? ""));
    if (!checked.ok) return failFrom(checked.error, 400);
    updateProjectDns(project.id, checked.value);
    return ok({ servers: checked.value, needsRedeploy: true });
  } catch (error) {
    return failFrom(error, 500);
  }
}

export const PUT = audited("project.dns", handlePUT, { detail: (b) => (Array.isArray(b.servers) ? b.servers.join(", ") : String(b.servers ?? "")) });

import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { startRedeploy } from "@/lib/redeploy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deploys the project again from the source of its last deploy (for example after changing env vars).
 * With `{ "deployId": "…" }` it rebuilds from that earlier deployment instead, which is a rollback.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { deployId?: unknown };
    const fromDeployId = typeof body.deployId === "string" && body.deployId ? body.deployId : undefined;
    return ok(startRedeploy((await params).id, fromDeployId), 202);
  } catch (error) {
    return failFrom(error);
  }
}

export const POST = audited("project.redeploy", handlePOST, { detail: (b) => (typeof b.deployId === "string" && b.deployId ? `rollback to ${b.deployId}` : undefined) });

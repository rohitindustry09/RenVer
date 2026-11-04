import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { getDatabaseRecord } from "@/lib/db";
import { linkDatabase } from "@/lib/databases";
import { deployLatest } from "@/lib/deploy-latest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adds the connection string to a project. With `redeploy: true` the project is deployed again so it takes effect,
 * with the newest code pulled from GitHub first when the project came from there. */
async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const record = getDatabaseRecord((await params).id);
    if (!record) return failFrom(Object.assign(new Error("Database not found."), { status: 404 }));
    const body = (await request.json()) as { projectId?: unknown; variable?: unknown; redeploy?: unknown };
    if (typeof body.projectId !== "string") return failFrom("Choose a project.");
    const variable = typeof body.variable === "string" && body.variable.trim() ? body.variable.trim() : undefined;
    const linked = linkDatabase(body.projectId, record, variable);
    const deploy = body.redeploy === true ? await deployLatest(body.projectId) : null;
    return ok({ variable: linked, deployId: deploy?.deployId ?? null, pulled: deploy?.pulled ?? false, note: deploy?.note ?? null });
  } catch (error) {
    return failFrom(error);
  }
}

export const POST = audited("database.link", handlePOST, { detail: (b) => (b.redeploy === true ? "with redeploy" : undefined) });

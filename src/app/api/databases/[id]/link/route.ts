import { failFrom, ok } from "@/lib/api";
import { getDatabaseRecord } from "@/lib/db";
import { linkDatabase } from "@/lib/databases";
import { startRedeploy } from "@/lib/redeploy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adds the connection string to a project. With `redeploy: true` the project is deployed again so it takes effect. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const record = getDatabaseRecord((await params).id);
    if (!record) return failFrom(Object.assign(new Error("Database not found."), { status: 404 }));
    const body = (await request.json()) as { projectId?: unknown; variable?: unknown; redeploy?: unknown };
    if (typeof body.projectId !== "string") return failFrom("Choose a project.");
    const variable = typeof body.variable === "string" && body.variable.trim() ? body.variable.trim() : undefined;
    const linked = linkDatabase(body.projectId, record, variable);
    const deploy = body.redeploy === true ? startRedeploy(body.projectId) : null;
    return ok({ variable: linked, deployId: deploy?.deployId ?? null });
  } catch (error) {
    return failFrom(error);
  }
}

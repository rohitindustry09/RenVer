import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { getDatabaseRecord } from "@/lib/db";
import { DatabaseError, pauseDatabase, resumeDatabase } from "@/lib/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Body: `{ "action": "pause" | "resume" }`. Resuming creates the container again if it is gone, and loads the data a
 * restored backup left for it.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const record = getDatabaseRecord((await params).id);
    if (!record) throw new DatabaseError("Database not found.", 404);
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (body.action === "pause") await pauseDatabase(record);
    else if (body.action === "resume") await resumeDatabase(record);
    else throw new DatabaseError("Choose pause or resume.", 400);
    return ok({ action: body.action });
  } catch (error) {
    return failFrom(error, 500);
  }
}

export const POST = audited("database.power", handlePOST, { detail: (b) => (typeof b.action === "string" ? b.action : undefined) });

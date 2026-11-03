import { fail, ok } from "@/lib/api";
import { getDatabaseRecord } from "@/lib/db";
import { DatabaseError, credentialsFor } from "@/lib/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only sent on request, behind the panel login, when someone presses "Show connection". */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const record = getDatabaseRecord((await params).id);
    if (!record) return fail("Database not found.", 404);
    return ok(credentialsFor(record));
  } catch (error) {
    return fail(error, error instanceof DatabaseError ? error.status : 500);
  }
}

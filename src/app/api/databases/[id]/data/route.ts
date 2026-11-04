import { recordAudit, actorOf } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { getDatabaseRecord } from "@/lib/db";
import { listTables, readTable } from "@/lib/data-browse";
import { DatabaseError } from "@/lib/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only look inside a database, behind the panel login.
 *   /data                              the tables
 *   /data?table=users&schema=public&page=0   the rows of one table, 50 at a time
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const record = getDatabaseRecord((await params).id);
    if (!record) return fail("Database not found.", 404);
    const query = new URL(request.url).searchParams;
    const table = query.get("table");
    if (table === null) {
      recordAudit(actorOf(request), "database.view", record.id, record.name);
      return ok({ tables: await listTables(record) });
    }
    const page = Number(query.get("page") ?? "0");
    return ok(await readTable(record, query.get("schema") ?? "", table, page));
  } catch (error) {
    return fail(error, error instanceof DatabaseError ? error.status : 500);
  }
}

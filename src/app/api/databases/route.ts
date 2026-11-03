import { fail, ok, publicDatabase, type DatabaseListItem } from "@/lib/api";
import { DatabaseError, createDatabase, linkedProjectsFor, listDatabasesWithLiveStatus } from "@/lib/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const records = await listDatabasesWithLiveStatus();
  const items: DatabaseListItem[] = records.map((r) => ({ ...publicDatabase(r), links: linkedProjectsFor(r) }));
  return ok(items);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown; engine?: unknown; version?: unknown };
    const record = createDatabase({
      name: String(body.name ?? ""),
      engine: String(body.engine ?? ""),
      version: String(body.version ?? ""),
    });
    return ok(publicDatabase(record), 202);
  } catch (error) {
    return fail(error, error instanceof DatabaseError ? error.status : 400);
  }
}

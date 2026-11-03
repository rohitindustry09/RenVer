import { fail, ok } from "@/lib/api";
import { listBackups, pruneBackups } from "@/lib/backup";
import { createBackupWithDatabases } from "@/lib/backup-all";
import { describeBackup } from "@/lib/backup-view";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(listBackups(config.dataDir).map(describeBackup));
}

/**
 * Every backup holds the database, the key and the data inside the running databases. A full one also holds the
 * project sources, which are what let apps be rebuilt on another machine.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { full?: unknown };
    const { databases, skipped, ...info } = await createBackupWithDatabases(body.full === true ? "full" : "manual");
    pruneBackups(config.dataDir);
    return ok({ ...describeBackup(info), databases, skipped }, 201);
  } catch (error) {
    return fail(error, 500);
  }
}

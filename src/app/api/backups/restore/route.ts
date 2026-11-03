import { failFrom, ok } from "@/lib/api";
import { createBackupWithDatabases } from "@/lib/backup-all";
import { applyRestoredState } from "@/lib/restore-state";
import { RestoreError, restoreLive } from "@/lib/restore-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restores a backup into the running panel. A safety backup of the current state (databases included) is taken first.
 * Afterwards everything that came back is paused: apps and databases are stopped and nothing is routed, so the owner
 * resumes each one when ready. A database that came with data loads it the first time it is resumed.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown };
    const summary = await restoreLive({
      name: typeof body.name === "string" ? body.name : "",
      safetyBackup: () => createBackupWithDatabases("manual"),
    });
    const paused = await applyRestoredState();
    return ok({ ...summary, paused });
  } catch (error) {
    return failFrom(error, error instanceof RestoreError ? error.status : 500);
  }
}

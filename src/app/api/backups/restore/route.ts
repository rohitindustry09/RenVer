import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { createBackupWithDatabases } from "@/lib/backup-all";
import { backupPassphrase } from "@/lib/backup-passphrase";
import { applyRestoredState } from "@/lib/restore-state";
import { RestoreError, restoreLive } from "@/lib/restore-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restores a backup into the running panel. A safety backup of the current state (databases included) is taken first.
 * Afterwards everything that came back is paused: apps and databases are stopped and nothing is routed, so the owner
 * resumes each one when ready. A database that came with data loads it the first time it is resumed.
 */
async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown; passphrase?: unknown };
    const typed = typeof body.passphrase === "string" && body.passphrase ? body.passphrase : undefined;
    const summary = await restoreLive({
      name: typeof body.name === "string" ? body.name : "",
      // What was typed wins, so a backup made on another server (with another passphrase) can still be opened.
      passphrase: typed ?? backupPassphrase(),
      safetyBackup: () => createBackupWithDatabases("manual"),
    });
    const paused = await applyRestoredState();
    return ok({ ...summary, paused });
  } catch (error) {
    return failFrom(error, error instanceof RestoreError ? error.status : 500);
  }
}

export const POST = audited("backup.restore", handlePOST);

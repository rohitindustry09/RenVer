import fs from "node:fs";
import { backupPath, createBackup, prepareRestore, pruneRestoreLeftovers, validateBackupArchive } from "./backup";
import { config } from "./config";
import { closeDatabase, listAllDeploys, listDatabaseRecords, listProjects } from "./db";
import { resetMasterKey } from "./secrets";

export class RestoreError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

export interface RestoreSummary {
  restored: string[];
  /** The backup taken of the state that was replaced, so the restore can be undone. */
  safetyBackup: string;
  projects: number;
}

const ACTIVE_DEPLOY_STATUSES = new Set(["queued", "building", "starting"]);

/** Why a restore cannot run right now, or null when it is safe. */
function busyReason(): string | null {
  if (listProjects().some((p) => p.status === "deploying") || listAllDeploys(100).some((d) => ACTIVE_DEPLOY_STATUSES.has(d.status))) {
    return "A deploy is in progress. Wait for it to finish, then try again.";
  }
  if (listDatabaseRecords().some((d) => d.status === "creating")) {
    return "A database is being created. Wait for it to finish, then try again.";
  }
  return null;
}

const messageOf = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

/** Opens the freshly restored database and reads from it. Throws if it cannot be used. */
const defaultVerify = (): void => {
  listProjects();
};

/**
 * Restores a backup into the running panel.
 *
 * Everything slow and checkable happens first: the archive is validated, its database is verified, and the files are
 * staged. Only then is a safety backup taken, the database closed, and the swap committed with no awaits in between,
 * so no request can reach the database mid-swap. If the restored database then cannot be opened, the swap is undone,
 * so a bad backup can never leave the panel without a working database.
 */
export async function restoreLive(input: {
  name: string;
  dataDir?: string;
  verify?: () => void;
  /** Makes the backup of the current state that lets a restore be undone. Defaults to a plain manual backup. */
  safetyBackup?: () => Promise<{ name: string }>;
}): Promise<RestoreSummary> {
  const dataDir = input.dataDir ?? config.dataDir;
  const verify = input.verify ?? defaultVerify;

  let file: string;
  try {
    file = backupPath(dataDir, input.name);
  } catch (error) {
    throw new RestoreError(messageOf(error, "Invalid backup name."), 400);
  }
  if (!fs.existsSync(file)) throw new RestoreError("Backup not found.", 404);

  const busy = busyReason();
  if (busy) throw new RestoreError(busy, 409);

  try {
    await validateBackupArchive(file);
  } catch (error) {
    throw new RestoreError(messageOf(error, "This file is not a RenVer backup."), 400);
  }

  let prepared: Awaited<ReturnType<typeof prepareRestore>>;
  try {
    prepared = await prepareRestore({ file, dataDir });
  } catch (error) {
    throw new RestoreError(messageOf(error, "This backup could not be prepared."), 400);
  }

  try {
    const safety = await (input.safetyBackup ? input.safetyBackup() : createBackup({ dataDir, kind: "manual" }));

    // The state could have changed while the slow steps ran; check again right before touching anything.
    const stillBusy = busyReason();
    if (stillBusy) throw new RestoreError(stillBusy, 409);

    closeDatabase();
    let committed: ReturnType<typeof prepared.commit>;
    try {
      committed = prepared.commit();
    } catch (error) {
      resetMasterKey();
      throw error;
    }
    resetMasterKey();

    try {
      verify();
    } catch (error) {
      committed.undo();
      closeDatabase();
      resetMasterKey();
      throw new RestoreError(
        `The restored database could not be opened, so nothing was changed. (${messageOf(error, "unknown error")})`,
        400,
      );
    }
    pruneRestoreLeftovers(dataDir);
    return { restored: committed.restored, safetyBackup: safety.name, projects: listProjects().length };
  } finally {
    prepared.cancel();
  }
}

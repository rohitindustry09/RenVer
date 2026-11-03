import path from "node:path";
import type { BackupInfo } from "./backup";
import { config } from "./config";

/** The shape of a backup as the browser sees it. */
export function describeBackup(backup: BackupInfo) {
  return {
    name: backup.name,
    bytes: backup.bytes,
    kind: backup.kind,
    encrypted: backup.encrypted,
    createdAt: backup.createdAt.toISOString(),
    file: path.join(config.dataDir, "backups", backup.name),
  };
}

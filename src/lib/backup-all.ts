import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBackup, type BackupInfo, type BackupKind, type DumpToInclude } from "./backup";
import { backupPassphrase } from "./backup-passphrase";
import { config } from "./config";
import { listDatabaseRecords } from "./db";
import { dumpCommand } from "./database-spec";
import { dumpFileName } from "./db-dumps";
import { isEngine } from "./database-engines";
import { execToGzipFile } from "./docker-dump";

export interface FullBackupResult extends BackupInfo {
  /** Names of the databases whose data is inside, and those that could not be dumped. */
  databases: string[];
  skipped: { name: string; reason: string }[];
}

/**
 * A backup of RenVer's state that also carries the data inside every running database, so one file brings everything
 * back. A database that cannot be dumped is reported, not fatal: the rest of the backup is still worth having.
 */
export async function createBackupWithDatabases(kind: BackupKind): Promise<FullBackupResult> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "renver-dumps-"));
  const dumps: DumpToInclude[] = [];
  const databases: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  try {
    for (const record of listDatabaseRecords()) {
      if (record.status === "paused" || record.status === "stopped") {
        skipped.push({ name: record.name, reason: "It is not running, so its data could not be read." });
        continue;
      }
      if (record.status !== "running" || !isEngine(record.engine)) continue;
      const name = dumpFileName(record.name, new Date(), "manual");
      const file = path.join(scratch, name);
      try {
        await execToGzipFile(record.container, dumpCommand(record.engine, record.username, record.database), file);
        dumps.push({ name, file });
        databases.push(record.name);
      } catch (error) {
        skipped.push({ name: record.name, reason: error instanceof Error ? error.message : "It could not be read." });
      }
    }
    const info = await createBackup({ dataDir: config.dataDir, kind, dumps, passphrase: backupPassphrase() });
    return { ...info, databases, skipped };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

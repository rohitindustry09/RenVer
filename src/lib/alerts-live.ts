import { computeAlerts, type Alert } from "./alerts";
import { listBackups } from "./backup";
import { config } from "./config";
import { listDatabaseRecords, listDomains, listProjects } from "./db";
import { collectUsage } from "./usage";

/** The alerts for right now, worked out from what RenVer currently knows. */
export function collectAlerts(): Alert[] {
  const usage = collectUsage();
  const newestBackup = listBackups(config.dataDir)[0];
  return computeAlerts({
    now: new Date(),
    projects: listProjects().map((p) => ({ id: p.id, name: p.name, status: p.status })),
    databases: listDatabaseRecords().map((d) => ({ id: d.id, name: d.name, status: d.status, error: d.error })),
    domains: listDomains().map((d) => ({ name: d.name, status: d.status })),
    memory: usage.memory,
    disk: usage.disk,
    lastBackupAt: newestBackup?.createdAt ?? null,
  });
}

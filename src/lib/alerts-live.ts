import { computeAlerts, type Alert } from "./alerts";
import { listBackups } from "./backup";
import { config } from "./config";
import { listDatabaseRecords, listDomains, listProjects } from "./db";
import { adminUsername } from "./login";
import { secretWarnings, type SecretWarning } from "./secret-checks";
import { collectUsage } from "./usage";

/** Weak or reused secrets in this server's settings. Only the warnings leave this function, never the secrets. */
export function currentSecretWarnings(): SecretWarning[] {
  return secretWarnings({
    password: process.env.RENVER_ADMIN_PASSWORD || undefined,
    passphrase: process.env.RENVER_BACKUP_PASSPHRASE || undefined,
    username: adminUsername(),
  });
}

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
    secretWarnings: currentSecretWarnings(),
  });
}

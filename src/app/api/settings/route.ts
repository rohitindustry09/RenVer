import os from "node:os";
import { ok } from "@/lib/api";
import { config } from "@/lib/config";
import { listProjects } from "@/lib/db";
import { currentSecretWarnings } from "@/lib/alerts-live";
import { adminUsername } from "@/lib/login";
import { getLimits } from "@/lib/runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BYTES_PER_MB = 1024 * 1024;

/** The running configuration. Mode and folders come from the environment; resource limits are edited in the UI. */
export async function GET() {
  const apps = listProjects();
  return ok({
    mode: config.mode,
    dataDir: config.dataDir,
    limits: getLimits(),
    hostCpus: os.availableParallelism(),
    totalMemoryMB: Math.round(os.totalmem() / BYTES_PER_MB),
    runningApps: apps.filter((p) => p.status === "running").length,
    usedPorts: apps.flatMap((p) => (p.hostPort ? [p.hostPort] : [])).sort((a, b) => a - b),
    passwordProtected: Boolean(process.env.RENVER_ADMIN_PASSWORD),
    adminUser: adminUsername(),
    secretWarnings: currentSecretWarnings(),
    twoFactor: Boolean(process.env.RENVER_TOTP_SECRET?.trim()),
    backupsEncrypted: Boolean(process.env.RENVER_BACKUP_PASSPHRASE),
    allowedAddressesSet: Boolean(process.env.RENVER_ALLOWED_IPS?.trim()),
    node: process.versions.node,
  });
}

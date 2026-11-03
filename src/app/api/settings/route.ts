import os from "node:os";
import { ok } from "@/lib/api";
import { config } from "@/lib/config";
import { listDomains, listProjects } from "@/lib/db";
import { getPanelHost } from "@/lib/panel-host";
import { currentSecretWarnings } from "@/lib/alerts-live";
import { adminPassword, adminUsername } from "@/lib/login";
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
    passwordProtected: Boolean(adminPassword()),
    adminUser: adminUsername(),
    panelHost: getPanelHost() ?? "",
    verifiedDomains: listDomains().filter((d) => d.status === "verified").map((d) => d.name),
    secretWarnings: currentSecretWarnings(),
    twoFactor: Boolean(process.env.RENVER_TOTP_SECRET?.trim()),
    backupsEncrypted: Boolean(process.env.RENVER_BACKUP_PASSPHRASE),
    allowedAddressesSet: Boolean(process.env.RENVER_ALLOWED_IPS?.trim()),
    node: process.versions.node,
  });
}

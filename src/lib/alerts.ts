/** Things worth the owner's attention, worked out from what RenVer already knows. Pure, so it is easy to test. */

export type AlertSeverity = "error" | "warning" | "info";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href?: string;
}

export interface AlertInput {
  now: Date;
  projects: { id: string; name: string; status: string }[];
  databases: { id: string; name: string; status: string; error: string | null }[];
  domains: { name: string; status: string }[];
  memory: { reservedMB: number; totalMB: number };
  disk: { freeBytes: number; totalBytes: number };
  lastBackupAt: Date | null;
  /** Weak or reused secrets (messages only, never the secrets themselves). */
  secretWarnings?: { id: string; message: string }[];
}

const MEMORY_WARN_RATIO = 0.9;
const DISK_WARN_FREE_RATIO = 0.1;
const DISK_WARN_FREE_BYTES = 2 * 1024 ** 3;
const STALE_BACKUP_HOURS = 48;
const MB_PER_GB = 1024;
const HOURS_PER_DAY = 24;
const SEVERITY_ORDER: Record<AlertSeverity, number> = { error: 0, warning: 1, info: 2 };

const gb = (mb: number): string => `${(mb / MB_PER_GB).toFixed(1)} GB`;

export function computeAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = [];

  for (const project of input.projects) {
    if (project.status === "failed") {
      alerts.push({
        id: `project-failed-${project.id}`,
        severity: "error",
        title: `${project.name} failed`,
        detail: "Its last deploy did not finish. Open it to see the build log.",
        href: `/projects/${project.id}`,
      });
    } else if (project.status === "stopped") {
      alerts.push({
        id: `project-stopped-${project.id}`,
        severity: "warning",
        title: `${project.name} is stopped`,
        detail: "Its container is not running and could not be restarted automatically.",
        href: `/projects/${project.id}`,
      });
    }
  }

  for (const database of input.databases) {
    if (database.status === "failed") {
      alerts.push({
        id: `database-failed-${database.id}`,
        severity: "error",
        title: `Database ${database.name} failed`,
        detail: database.error ?? "It could not be created.",
        href: "/databases",
      });
    } else if (database.status === "stopped") {
      alerts.push({
        id: `database-stopped-${database.id}`,
        severity: "warning",
        title: `Database ${database.name} is stopped`,
        detail: "Apps that use it cannot connect until it is running again.",
        href: "/databases",
      });
    }
  }

  for (const domain of input.domains) {
    if (domain.status === "pending") {
      alerts.push({
        id: `domain-pending-${domain.name}`,
        severity: "warning",
        title: `Verify ${domain.name}`,
        detail: "Add the DNS record to prove you own it. It cannot be used until then.",
        href: "/domains",
      });
    }
  }

  const { reservedMB, totalMB } = input.memory;
  if (totalMB > 0 && reservedMB > totalMB * MEMORY_WARN_RATIO) {
    alerts.push({
      id: "memory-overcommitted",
      severity: "warning",
      title: "Apps may not fit in memory",
      detail: `Their limits add up to ${gb(reservedMB)} of ${gb(totalMB)}. Lower the memory per app in Settings.`,
      href: "/settings",
    });
  }

  const { freeBytes, totalBytes } = input.disk;
  if (totalBytes > 0 && (freeBytes < totalBytes * DISK_WARN_FREE_RATIO || freeBytes < DISK_WARN_FREE_BYTES)) {
    alerts.push({
      id: "disk-low",
      severity: "warning",
      title: "Disk space is low",
      detail: `${(freeBytes / 1024 ** 3).toFixed(1)} GB free. Builds and images need room; delete projects you no longer use.`,
    });
  }

  if (input.lastBackupAt === null) {
    alerts.push({
      id: "backup-none",
      severity: "info",
      title: "No backup yet",
      detail: "The first automatic backup is made at the scheduled time. You can also make one now.",
      href: "/settings",
    });
  } else {
    const hours = (input.now.getTime() - input.lastBackupAt.getTime()) / 3_600_000;
    if (hours > STALE_BACKUP_HOURS) {
      const days = Math.floor(hours / HOURS_PER_DAY);
      alerts.push({
        id: "backup-stale",
        severity: "warning",
        title: "No recent backup",
        detail: `The newest backup is ${days} days old. Check that automatic backups are on.`,
        href: "/settings",
      });
    }
  }

  for (const warning of input.secretWarnings ?? []) {
    alerts.push({ id: `secret-${warning.id}`, severity: "warning", title: "Weak or reused secret", detail: warning.message, href: "/settings" });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

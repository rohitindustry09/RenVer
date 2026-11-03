import { lastAutoBackupAt, pruneBackups } from "./backup";
import { createBackupWithDatabases } from "./backup-all";
import { nextAutoBackup } from "./backup-schedule";
import { getBackupSchedule } from "./runtime-settings";
import { getLiveRouteHosts, isCaddyRunning } from "./caddy";
import { config } from "./config";
import { getPanelHost } from "./panel-host";
import {
  listDatabaseRecords,
  listProjects,
  listRunningRoutes,
  updateDatabaseStatus,
  updateProject,
} from "./db";
import { dumpDatabase } from "./databases";
import { pruneDumps } from "./db-dumps";
import { syncProxy } from "./deploy";
import { dockerStart, runningContainerNames } from "./docker";
import { notifyNewAlerts } from "./notifier";
import { makeExclusive, reconcile, type ReconcileDeps, type ReconcileReport } from "./reconcile";

const FIRST_RUN_DELAY_MS = 10_000;
const INTERVAL_MS = 30_000;

const globalWatchdog = globalThis as typeof globalThis & { __renverWatchdog?: ReturnType<typeof setInterval> };

function realDeps(): ReconcileDeps {
  return {
    projects: () => listProjects().map((p) => ({ id: p.id, name: p.name, status: p.status, container: p.container })),
    databases: () => listDatabaseRecords().map((d) => ({ id: d.id, name: d.name, status: d.status, container: d.container })),
    runningContainers: async () => {
      const [apps, databases] = await Promise.all([
        runningContainerNames("renver.project"),
        runningContainerNames("renver.kind=database"),
      ]);
      return new Set([...apps, ...databases]);
    },
    startContainer: dockerStart,
    setProjectStatus: (id, status) => updateProject(id, { status }),
    setDatabaseStatus: (id, status) => updateDatabaseStatus(id, status),
    proxy: {
      isUp: () => isCaddyRunning(),
      liveHosts: () => getLiveRouteHosts(),
      desiredHosts: () => [
        ...listRunningRoutes().flatMap((route) => route.hosts),
        ...(getPanelHost() ? [getPanelHost() as string] : []),
      ],
      apply: () => syncProxy(() => undefined),
    },
  };
}

function logReport(report: ReconcileReport): void {
  const changed = report.restarted.length + report.markedStopped.length + report.markedRunning.length > 0 || report.proxyApplied;
  if (!changed && report.errors.length === 0) return;
  const parts = [
    report.restarted.length ? `restarted ${report.restarted.join(", ")}` : "",
    report.markedStopped.length ? `marked stopped ${report.markedStopped.join(", ")}` : "",
    report.markedRunning.length ? `marked running ${report.markedRunning.join(", ")}` : "",
    report.proxyApplied ? "re-synced proxy routes" : "",
    report.errors.length ? `problems: ${report.errors.join("; ")}` : "",
  ].filter(Boolean);
  process.stdout.write(`[renver] watchdog: ${parts.join(" | ")}\n`);
}

/**
 * A small daily backup (database and key) at the time chosen on the Settings page. If RenVer was not running at that
 * time, it is made as soon as RenVer is running again. It is what makes "restore and carry on" possible after a disaster.
 */
async function backupIfDue(): Promise<void> {
  const schedule = getBackupSchedule();
  const next = nextAutoBackup({ now: new Date(), lastAutoAt: lastAutoBackupAt(config.dataDir), ...schedule });
  if (!next?.isDue) return;
  const info = await createBackupWithDatabases("auto");
  const pruned = pruneBackups(config.dataDir);
  process.stdout.write(`[renver] automatic backup ${info.name}${pruned ? ` (removed ${pruned} old)` : ""}\n`);
  await dumpRunningDatabases();
}

/** The data inside database containers is not part of RenVer's own backup, so it is dumped alongside it. */
async function dumpRunningDatabases(): Promise<void> {
  for (const record of listDatabaseRecords().filter((d) => d.status === "running")) {
    try {
      const dump = await dumpDatabase(record, "auto");
      pruneDumps(config.dataDir, record.name);
      process.stdout.write(`[renver] database backup ${dump.name}\n`);
    } catch (error) {
      process.stderr.write(`[renver] database backup of ${record.name} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

/** One watchdog pass. Never throws, so a failure cannot stop the schedule. */
export async function watchdogTick(): Promise<void> {
  try {
    logReport(await reconcile(realDeps()));
  } catch (error) {
    process.stderr.write(`[renver] watchdog failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  try {
    await backupIfDue();
  } catch (error) {
    process.stderr.write(`[renver] automatic backup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  try {
    const sent = await notifyNewAlerts();
    if (sent > 0) process.stdout.write(`[renver] notified about ${sent} alert${sent === 1 ? "" : "s"}\n`);
  } catch (error) {
    process.stderr.write(`[renver] notification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/** Starts the repeating watchdog once per server process, even across hot reloads. */
export function startWatchdog(): void {
  if (globalWatchdog.__renverWatchdog) return;
  const run = makeExclusive(watchdogTick);
  setTimeout(() => void run(), FIRST_RUN_DELAY_MS).unref();
  globalWatchdog.__renverWatchdog = setInterval(() => void run(), INTERVAL_MS);
  globalWatchdog.__renverWatchdog.unref();
}

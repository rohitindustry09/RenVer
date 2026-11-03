/**
 * Node-only startup work. Kept in its own file so Next never tries to bundle it for the Edge runtime
 * (which cannot import node:child_process and friends).
 */
export async function startBackgroundWork(): Promise<void> {
  // A restore made with the command line (while the panel was off) leaves a note: pause everything before anything restarts.
  const { applyRestoredState } = await import("./lib/restore-state");
  const paused = await applyRestoredState().catch(() => null);
  if (paused) process.stdout.write(`[renver] restored backup: paused ${paused.projects} project(s) and ${paused.databases} database(s)\n`);

  const { pruneUploads } = await import("./lib/upload-cleanup");
  const removed = pruneUploads();
  if (removed > 0) process.stdout.write(`[renver] removed ${removed} old saved source(s)\n`);

  const { startWatchdog } = await import("./lib/watchdog");
  // The watchdog's first pass re-syncs routes and restarts anything that died while the panel was down.
  startWatchdog();

  const { listProjects } = await import("./lib/db");
  const hasRunningApps = listProjects().some((p) => p.status === "running" && p.hostPort !== null);
  if (!hasRunningApps) return;

  // Do not wait for the first watchdog pass: put the routes back straight away.
  const { syncProxy } = await import("./lib/deploy");
  void syncProxy((line) => process.stdout.write(`[renver] ${line}\n`));
}

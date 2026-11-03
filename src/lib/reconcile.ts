/**
 * The watchdog. While the panel runs, it compares what the database says should be running with what Docker
 * and Caddy are really doing, and repairs the difference. All side effects are injected so the logic is testable.
 */

export interface ReconcileDeps {
  projects(): { id: string; name: string; status: string; container: string | null }[];
  databases(): { id: string; name: string; status: string; container: string }[];
  /** Names of running containers. Throws when Docker cannot be reached. */
  runningContainers(): Promise<Set<string>>;
  startContainer(name: string): Promise<void>;
  setProjectStatus(id: string, status: "running" | "stopped"): void;
  setDatabaseStatus(id: string, status: "running" | "stopped"): void;
  proxy: {
    isUp(): Promise<boolean>;
    /** Hostnames Caddy is routing right now, or null when they cannot be read. */
    liveHosts(): Promise<string[] | null>;
    /** Hostnames that should be routed, from the database. */
    desiredHosts(): string[];
    apply(): Promise<boolean>;
  };
}

export interface ReconcileReport {
  restarted: string[];
  markedStopped: string[];
  markedRunning: string[];
  proxyApplied: boolean;
  errors: string[];
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface Tracked {
  key: string;
  status: string;
  container: string | null;
  mark: (status: "running" | "stopped") => void;
}

/** Brings one tracked container back, or records that it could not be. */
async function repair(item: Tracked, running: Set<string>, deps: ReconcileDeps, report: ReconcileReport): Promise<void> {
  if (!item.container) return;
  const isUp = running.has(item.container);

  if (item.status === "stopped" && isUp) {
    item.mark("running");
    report.markedRunning.push(item.key);
    return;
  }
  if (item.status !== "running" || isUp) return;

  try {
    await deps.startContainer(item.container);
    report.restarted.push(item.container);
  } catch (error) {
    item.mark("stopped");
    report.markedStopped.push(item.key);
    report.errors.push(`${item.container}: ${message(error)}`);
  }
}

async function repairContainers(deps: ReconcileDeps, report: ReconcileReport): Promise<void> {
  let running: Set<string>;
  try {
    running = await deps.runningContainers();
  } catch (error) {
    // Without a view of Docker nothing can be judged, so no status is changed.
    report.errors.push(`Docker: ${message(error)}`);
    return;
  }

  const projects: Tracked[] = deps.projects().map((p) => ({
    key: p.id,
    status: p.status,
    container: p.container,
    mark: (status) => deps.setProjectStatus(p.id, status),
  }));
  const databases: Tracked[] = deps.databases().map((d) => ({
    key: d.id,
    status: d.status,
    container: d.container,
    mark: (status) => deps.setDatabaseStatus(d.id, status),
  }));
  for (const item of [...projects, ...databases]) await repair(item, running, deps, report);
}

const sameHosts = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((host, i) => host === [...b].sort()[i]);

async function repairProxy(deps: ReconcileDeps, report: ReconcileReport): Promise<void> {
  const desired = [...new Set(deps.proxy.desiredHosts())];
  const isUp = await deps.proxy.isUp();
  if (!isUp && desired.length === 0) return; // nothing to serve, so do not start Caddy

  let needsApply = !isUp;
  if (isUp) {
    const live = await deps.proxy.liveHosts();
    needsApply = live === null || !sameHosts([...new Set(live)], desired);
  }
  if (!needsApply) return;
  try {
    report.proxyApplied = await deps.proxy.apply();
  } catch (error) {
    report.errors.push(`Proxy: ${message(error)}`);
  }
}

export async function reconcile(deps: ReconcileDeps): Promise<ReconcileReport> {
  const report: ReconcileReport = { restarted: [], markedStopped: [], markedRunning: [], proxyApplied: false, errors: [] };
  await repairContainers(deps, report);
  await repairProxy(deps, report);
  return report;
}

/** Wraps a task so a run that begins while the previous one is still going is skipped, not stacked. */
export function makeExclusive(task: () => Promise<void>): () => Promise<"ran" | "skipped"> {
  let isRunning = false;
  return async () => {
    if (isRunning) return "skipped";
    isRunning = true;
    try {
      await task();
      return "ran";
    } finally {
      isRunning = false;
    }
  };
}

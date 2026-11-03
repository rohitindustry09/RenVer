import { clearRestoreMarker, readRestoreMarker } from "./backup";
import { config } from "./config";
import { listDatabaseRecords, listProjects, updateDatabaseStatus, updateProject } from "./db";
import { setPendingRestoreDump } from "./databases";
import { syncProxy } from "./deploy";
import { dockerStop } from "./docker";
import { planPause } from "./restore-plan";

export interface RestoredState {
  projects: number;
  databases: number;
}

/**
 * Run once after a restore (right away for a restore from the panel, or at the next start for the restore command).
 * Everything that came back is paused: containers are stopped, nothing is routed, and each database remembers the saved
 * copy to load when it is resumed. The owner then starts things as they want. Returns null when nothing was pending.
 */
export async function applyRestoredState(): Promise<RestoredState | null> {
  const marker = readRestoreMarker(config.dataDir);
  if (!marker) return null;

  const plan = planPause({
    projects: listProjects().map((p) => ({ id: p.id, status: p.status, container: p.container })),
    databases: listDatabaseRecords().map((d) => ({ id: d.id, name: d.name, status: d.status, container: d.container })),
    dumps: marker.dumps,
  });

  for (const project of plan.projects) {
    await dockerStop(project.container).catch(() => undefined);
    updateProject(project.id, { status: "paused" });
  }
  for (const database of plan.databases) {
    await dockerStop(database.container).catch(() => undefined);
    updateDatabaseStatus(database.id, "paused");
    setPendingRestoreDump(database.id, database.dump);
  }
  await syncProxy(() => undefined).catch(() => undefined);
  clearRestoreMarker(config.dataDir);
  return { projects: plan.projects.length, databases: plan.databases.length };
}

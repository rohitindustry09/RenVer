import { listDatabaseRecords, listProjects } from "./db";
import { DatabaseError } from "./databases";
import { planCleanup, removableVolumes, type CleanupScan } from "./cleanup";
import { readDockerDf, realDocker, type DockerRunner } from "./docker-df";
import { volumeName } from "./volume-name";

const CLEAN_TIMEOUT_MS = 10 * 60_000;
/** Images made within this long are kept, so one that has just been built but not started yet is never removed. */
const KEEP_RECENT = "1h";

/** Volume names RenVer still needs: every database's data volume and every saved folder of every project. */
function referencedVolumes(): Set<string> {
  const names = new Set<string>(listDatabaseRecords().map((d) => d.volume));
  for (const project of listProjects()) for (const path of project.config.storage ?? []) names.add(volumeName(project.id, path));
  return names;
}

export async function scanDisk(docker: DockerRunner = realDocker): Promise<CleanupScan> {
  return planCleanup(await readDockerDf(docker), referencedVolumes());
}

export interface CleanupRequest {
  buildCache: boolean;
  images: boolean;
  /** Volume names to remove. Each must still be on the removable list when the cleanup runs. */
  volumes: string[];
}

export interface CleanupStep {
  label: string;
  ok: boolean;
  message: string;
}

export interface CleanupResult {
  freedBytes: number;
  steps: CleanupStep[];
}

/**
 * Does the chosen cleanup. A deploy in progress blocks it. Volumes are checked again against a fresh scan, so something
 * that became used, or was never on the list, is skipped; and `docker volume rm` itself refuses a volume in use.
 */
export async function runCleanup(request: CleanupRequest, docker: DockerRunner = realDocker): Promise<CleanupResult> {
  if (listProjects().some((p) => p.status === "deploying")) {
    throw new DatabaseError("A deploy is running. Clean up after it finishes, so a build that has just finished is not removed.", 409);
  }
  const before = await scanDisk(docker);
  const steps: CleanupStep[] = [];

  if (request.buildCache) {
    steps.push(await attempt("Build cache", () => docker(["builder", "prune", "--force"], CLEAN_TIMEOUT_MS)));
  }
  if (request.images) {
    steps.push(await attempt("Unused images", () => docker(["image", "prune", "--all", "--force", "--filter", `until=${KEEP_RECENT}`], CLEAN_TIMEOUT_MS)));
  }
  if (request.volumes.length > 0) {
    const df = await readDockerDf(docker);
    const removable = removableVolumes(df, referencedVolumes());
    const allowed = new Set([...removable.app, ...removable.renver].map((v) => v.name));
    for (const name of new Set(request.volumes)) {
      if (!allowed.has(name)) {
        steps.push({ label: `Volume ${name.slice(0, 14)}`, ok: false, message: "Skipped: it is not on the list of volumes that can be removed (it may be in use now)." });
        continue;
      }
      steps.push(await attempt(`Volume ${name.slice(0, 14)}`, () => docker(["volume", "rm", name], CLEAN_TIMEOUT_MS)));
    }
  }

  const after = await scanDisk(docker);
  return { freedBytes: Math.max(0, before.totalBytes - after.totalBytes), steps };
}

async function attempt(label: string, task: () => Promise<string>): Promise<CleanupStep> {
  try {
    await task();
    return { label, ok: true, message: "Done" };
  } catch (error) {
    return { label, ok: false, message: error instanceof Error ? error.message : "Failed" };
  }
}

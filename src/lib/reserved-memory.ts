import { DATABASE_MEMORY_MB, effectiveLimits, memoryToMb, type ProjectLimits } from "./limits";

/**
 * What the running apps and databases are allowed to use at most (their limits added up). An app with its own limit
 * counts that limit, not the global one. Pure.
 */
export function reservedMemory(
  projects: readonly { status: string; config: { limits?: ProjectLimits } }[],
  runningDatabases: number,
  globalLimits: { memory: string; cpus: string },
): { appsMB: number; databasesMB: number; appsCpu: number } {
  let appsMB = 0;
  let appsCpu = 0;
  for (const project of projects) {
    if (project.status !== "running") continue;
    const limit = effectiveLimits(globalLimits, project.config.limits);
    appsMB += memoryToMb(limit.memory) ?? memoryToMb(globalLimits.memory) ?? 0;
    appsCpu += Number(limit.cpus) || Number(globalLimits.cpus) || 0;
  }
  return { appsMB, databasesMB: runningDatabases * DATABASE_MEMORY_MB, appsCpu: Math.round(appsCpu * 100) / 100 };
}

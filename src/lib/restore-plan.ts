import { parseDumpName } from "./db-dumps";

/** After a restore everything is paused, so the owner starts things when ready. This decides what to pause. Pure. */

interface PlanProject {
  id: string;
  status: string;
  container: string | null;
}

interface PlanDatabase {
  id: string;
  name: string;
  status: string;
  container: string;
}

export interface PausePlan {
  projects: { id: string; container: string }[];
  /** `dump` is the saved copy to load into the database the first time it is resumed, if the backup carried one. */
  databases: { id: string; container: string; dump: string | null }[];
}

const SKIPPED_DATABASE_STATUSES = new Set(["creating", "failed"]);

function newestDumpFor(name: string, dumps: readonly string[]): string | null {
  const own = dumps.flatMap((dump) => {
    const parsed = parseDumpName(dump);
    return parsed?.database === name ? [{ dump, at: parsed.createdAt.getTime() }] : [];
  });
  return own.sort((a, b) => b.at - a.at)[0]?.dump ?? null;
}

export function planPause(input: { projects: PlanProject[]; databases: PlanDatabase[]; dumps: string[] }): PausePlan {
  return {
    projects: input.projects.flatMap((p) => (p.container && p.status !== "deploying" ? [{ id: p.id, container: p.container }] : [])),
    databases: input.databases.flatMap((d) =>
      SKIPPED_DATABASE_STATUSES.has(d.status) ? [] : [{ id: d.id, container: d.container, dump: newestDumpFor(d.name, input.dumps) }],
    ),
  };
}

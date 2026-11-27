export interface WatchedProject {
  projectId: string;
  /** "owner/name" of the GitHub repository the project was imported from. */
  repo: string;
  branch: string | null;
  /** The full commit that is deployed now, or null for an import that did not record it. */
  deployedCommit: string | null;
}

export interface ProjectUpdate {
  projectId: string;
  repo: string;
  branch: string | null;
  /** Short ids, for display. */
  deployed: string | null;
  latest: string | null;
  hasUpdate: boolean;
  /** The first line of the newest commit's message, when an update is waiting and GitHub told us. */
  message: string | null;
  error: string | null;
}

export interface ProjectUpdates {
  checkedAt: number;
  updates: ProjectUpdate[];
}

interface Deps {
  projects(): WatchedProject[];
  /** The newest commit of a branch (or of the default branch when null), or why it could not be read. */
  remoteHead(repo: string, branch: string | null): Promise<{ sha: string | null; error: string | null }>;
  commitMessage(repo: string, sha: string): Promise<string | null>;
  now(): number;
  minGapMs: number;
}

const SHORT = 7;
const FORCE_GAP_MS = 3_000;
const MAX_PARALLEL = 4;
const short = (sha: string | null): string | null => (sha ? sha.slice(0, SHORT) : null);

/** Runs `work` over `items`, a few at a time. */
async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  return results;
}

/**
 * For every project imported from GitHub: is there a commit on its branch that is not deployed yet? Each repository and
 * branch is looked up once (however many projects share it), answers are reused for a short while, and one repository
 * that cannot be read never hides the others.
 */
export function createProjectWatcher(deps: Deps) {
  let latest: ProjectUpdates | null = null;
  let inFlight: Promise<ProjectUpdates> | null = null;

  async function run(): Promise<ProjectUpdates> {
    const projects = deps.projects();
    const refs = [...new Map(projects.map((p) => [`${p.repo}#${p.branch ?? ""}`, p] as const)).values()];
    const heads = new Map<string, { sha: string | null; error: string | null }>();
    await inBatches(refs, MAX_PARALLEL, async (p) => heads.set(`${p.repo}#${p.branch ?? ""}`, await deps.remoteHead(p.repo, p.branch)));

    const updates = await Promise.all(
      projects.map(async (p): Promise<ProjectUpdate> => {
        const head = heads.get(`${p.repo}#${p.branch ?? ""}`) ?? { sha: null, error: null };
        const hasUpdate = Boolean(head.sha && p.deployedCommit && head.sha !== p.deployedCommit);
        return {
          projectId: p.projectId,
          repo: p.repo,
          branch: p.branch,
          deployed: short(p.deployedCommit),
          latest: short(head.sha),
          hasUpdate,
          message: hasUpdate && head.sha ? await deps.commitMessage(p.repo, head.sha) : null,
          error: head.error,
        };
      }),
    );
    return { checkedAt: deps.now(), updates };
  }

  return {
    last: (): ProjectUpdates | null => latest,

    async check(force = false): Promise<ProjectUpdates> {
      if (inFlight) return inFlight;
      if (latest && deps.now() - latest.checkedAt < (force ? FORCE_GAP_MS : deps.minGapMs)) return latest;
      inFlight = run()
        .then((result) => (latest = result))
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}

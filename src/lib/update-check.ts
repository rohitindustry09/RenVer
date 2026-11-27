export interface PendingCommit {
  commit: string;
  subject: string;
}

export interface UpdateCheck {
  checkedAt: number;
  /** The version running now (short commit and its first line). */
  current: PendingCommit | null;
  /** The GitHub branch this copy follows, for example "origin/main". Null when it follows none. */
  upstream: string | null;
  /** How many commits GitHub has that this copy does not. */
  behind: number;
  /** How many commits this copy has that GitHub does not. */
  ahead: number;
  /** The commits waiting, newest first (at most a handful). */
  commits: PendingCommit[];
  error: string | null;
}

interface Deps {
  git(args: string[]): Promise<{ code: number; out: string }>;
  now(): number;
  /** Asking GitHub more often than this reuses the last answer. */
  minGapMs: number;
}

const SHOWN_COMMITS = 10;
/** A forced check can repeat this soon, no sooner: several people pressing the button must not hammer GitHub. */
const FORCE_GAP_MS = 3_000;

function parseCommits(text: string): PendingCommit[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [commit = "", ...subject] = line.split("\t");
      return { commit, subject: subject.join("\t") };
    });
}

/** Looks at GitHub (git fetch) and says whether a newer version waits there. One check runs at a time and answers are reused briefly. */
export function createUpdateChecker({ git, now, minGapMs }: Deps) {
  let latest: UpdateCheck | null = null;
  let inFlight: Promise<UpdateCheck> | null = null;

  async function run(): Promise<UpdateCheck> {
    const current = parseCommits((await git(["log", "-1", "--format=%h%x09%s"])).out)[0] ?? null;
    const upstreamAnswer = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    const upstream = upstreamAnswer.code === 0 ? upstreamAnswer.out.trim() : "";
    if (!upstream) {
      return { checkedAt: now(), current, upstream: null, behind: 0, ahead: 0, commits: [], error: "This copy is not tracking a GitHub branch, so updates cannot be checked." };
    }

    const fetched = await git(["fetch", "--quiet"]);
    const counts = await git(["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
    const [ahead = 0, behind = 0] = counts.out.trim().split(/\s+/).map(Number);
    const commits = behind > 0 ? parseCommits((await git(["log", `-n`, String(SHOWN_COMMITS), "--format=%h%x09%s", "HEAD..@{u}"])).out) : [];
    return {
      checkedAt: now(),
      current,
      upstream,
      behind,
      ahead,
      commits,
      error: fetched.code === 0 ? null : "Could not reach GitHub to look for updates. Showing what was known before.",
    };
  }

  return {
    last: (): UpdateCheck | null => latest,

    async check(force = false): Promise<UpdateCheck> {
      if (inFlight) return inFlight;
      const gap = force ? FORCE_GAP_MS : minGapMs;
      if (latest && now() - latest.checkedAt < gap) return latest;
      inFlight = run()
        .then((result) => (latest = result))
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}

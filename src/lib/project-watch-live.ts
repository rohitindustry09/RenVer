import { spawn } from "node:child_process";
import { listProjects } from "./db";
import { getGithubToken, gitAuthEnv } from "./github-auth";
import { redactToken } from "./github-token";
import { createProjectWatcher, type WatchedProject } from "./project-watch";
import { githubDeployedFor } from "./webhooks";

type Watcher = ReturnType<typeof createProjectWatcher>;

const GIT_TIMEOUT_MS = 20_000;
const CHECK_GAP_MS = 30_000;
const MESSAGE_CACHE_LIMIT = 200;
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
/** Never starts with "-", so a stored branch name can not be read as a git option. */
const BRANCH = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}$/;

function projects(): WatchedProject[] {
  return listProjects().flatMap((project) => {
    const source = githubDeployedFor(project.id);
    return source ? [{ projectId: project.id, repo: source.repo, branch: source.branch, deployedCommit: source.commit }] : [];
  });
}

/** Maps what git says to a message that helps, without ever repeating the token. */
function explain(stderr: string, token: string | null, hasBranch: boolean): string {
  const text = redactToken(stderr, token).toLowerCase();
  if (/authentication failed|could not read username|repository not found|not found|denied/.test(text)) {
    return "No access. If the repository is private, connect GitHub in Settings with a token that can read it.";
  }
  if (/could not resolve|unable to access|timed out|connection/.test(text)) return "Could not reach GitHub from this server.";
  return hasBranch ? "Could not read the branch." : "Could not read the repository.";
}

/** The newest commit of a branch, with `git ls-remote`: no clone and no API limit. */
function remoteHead(repo: string, branch: string | null): Promise<{ sha: string | null; error: string | null }> {
  if (!REPO.test(repo) || (branch !== null && !BRANCH.test(branch))) return Promise.resolve({ sha: null, error: "Unrecognised repository name." });
  const token = getGithubToken();
  return new Promise((done) => {
    const ref = branch ? `refs/heads/${branch}` : "HEAD";
    const child = spawn("git", ["ls-remote", `https://github.com/${repo}.git`, ref], {
      env: { ...process.env, ...gitAuthEnv(token), GIT_TERMINAL_PROMPT: "0" },
      windowsHide: true,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), GIT_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => void (out += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => void (err += chunk.toString("utf8")));
    child.on("error", () => {
      clearTimeout(timer);
      done({ sha: null, error: "Could not run git on this server." });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const sha = /^([0-9a-f]{40})\t/m.exec(out)?.[1] ?? null;
      if (code === 0 && sha) return done({ sha, error: null });
      done({ sha: null, error: code === 0 ? (branch ? "That branch does not exist on GitHub." : "The repository has no commits.") : explain(err, token, branch !== null) });
    });
  });
}

const messages = new Map<string, string | null>();

/** The first line of a commit's message. Kept per commit (a commit never changes), and null when GitHub would not say. */
async function commitMessage(repo: string, sha: string): Promise<string | null> {
  if (messages.has(sha)) return messages.get(sha) ?? null;
  const token = getGithubToken();
  let line: string | null = null;
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RenVer",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(GIT_TIMEOUT_MS),
    });
    if (response.ok) {
      const body = (await response.json()) as { commit?: { message?: unknown } };
      line = typeof body.commit?.message === "string" ? (body.commit.message.split("\n")[0] ?? null) : null;
    }
  } catch {
    // the message is a nicety; the update itself is still reported
  }
  if (messages.size >= MESSAGE_CACHE_LIMIT) messages.clear();
  messages.set(sha, line);
  return line;
}

const globalKey = Symbol.for("renver.projectWatcher");
type Holder = { [globalKey]?: Watcher };

/** The one watcher of this process: for every project from GitHub, looks for commits that are not deployed yet. */
export function projectWatcher(): Watcher {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createProjectWatcher({ projects, remoteHead, commitMessage, now: Date.now, minGapMs: CHECK_GAP_MS });
  return holder[globalKey];
}

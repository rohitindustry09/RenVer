import { describe, expect, it } from "vitest";
import { createProjectWatcher, type WatchedProject } from "@/lib/project-watch";

const sha = (c: string) => c.repeat(40).slice(0, 40);
const A = sha("a");
const B = sha("b");

const project = (id: string, repo: string, branch: string | null, deployedCommit: string | null): WatchedProject => ({ projectId: id, repo, branch, deployedCommit });

function setup(opts: { projects: WatchedProject[]; heads?: Record<string, string | { error: string }>; messages?: Record<string, string> }) {
  const heads: string[] = [];
  const messages: string[] = [];
  const clock = { t: 0 };
  const watcher = createProjectWatcher({
    projects: () => opts.projects,
    remoteHead: async (repo, branch) => {
      const key = `${repo}#${branch ?? ""}`;
      heads.push(key);
      const answer = opts.heads?.[key];
      if (answer === undefined) return { sha: null, error: "no such ref" };
      return typeof answer === "string" ? { sha: answer, error: null } : { sha: null, error: answer.error };
    },
    commitMessage: async (repo, commit) => {
      messages.push(`${repo}@${commit.slice(0, 7)}`);
      return opts.messages?.[commit] ?? null;
    },
    now: () => clock.t,
    minGapMs: 30_000,
  });
  return { watcher, heads, messages, clock };
}

describe("watching projects that come from GitHub", () => {
  it("flags a project whose repository has a newer commit than the one deployed", async () => {
    const { watcher } = setup({ projects: [project("p1", "me/app", "main", A)], heads: { "me/app#main": B }, messages: { [B]: "feat: new thing" } });
    const result = await watcher.check();
    expect(result.updates).toEqual([
      { projectId: "p1", repo: "me/app", branch: "main", deployed: "aaaaaaa", latest: "bbbbbbb", hasUpdate: true, message: "feat: new thing", error: null },
    ]);
  });

  it("says nothing is new when the deployed commit is the newest", async () => {
    const { watcher, messages } = setup({ projects: [project("p1", "me/app", null, A)], heads: { "me/app#": A } });
    const [only] = (await watcher.check()).updates;
    expect(only).toMatchObject({ hasUpdate: false, message: null, latest: "aaaaaaa" });
    expect(messages).toEqual([]);
  });

  it("cannot tell when the deployed commit is unknown, and does not claim an update", async () => {
    const { watcher } = setup({ projects: [project("p1", "me/app", "main", null)], heads: { "me/app#main": B } });
    expect((await watcher.check()).updates[0]).toMatchObject({ hasUpdate: false, deployed: null, latest: "bbbbbbb" });
  });

  it("asks GitHub once per repository and branch, however many projects use it", async () => {
    const { watcher, heads } = setup({
      projects: [project("p1", "me/app", "main", A), project("p2", "me/app", "main", B), project("p3", "me/app", "dev", A)],
      heads: { "me/app#main": B, "me/app#dev": A },
    });
    const { updates } = await watcher.check();
    expect(heads.sort()).toEqual(["me/app#dev", "me/app#main"]);
    expect(updates.map((u) => [u.projectId, u.hasUpdate])).toEqual([["p1", true], ["p2", false], ["p3", false]]);
  });

  it("records a problem for one repository without losing the others", async () => {
    const { watcher } = setup({
      projects: [project("p1", "me/private", "main", A), project("p2", "me/app", "main", A)],
      heads: { "me/private#main": { error: "No access" }, "me/app#main": B },
    });
    const { updates } = await watcher.check();
    expect(updates[0]).toMatchObject({ projectId: "p1", hasUpdate: false, error: "No access", latest: null });
    expect(updates[1]).toMatchObject({ projectId: "p2", hasUpdate: true, error: null });
  });

  it("has nothing to report when no project comes from GitHub", async () => {
    const { watcher, heads } = setup({ projects: [] });
    expect((await watcher.check()).updates).toEqual([]);
    expect(heads).toEqual([]);
  });

  it("reuses a recent answer, and asks again after the gap or when forced", async () => {
    const { watcher, heads, clock } = setup({ projects: [project("p1", "me/app", "main", A)], heads: { "me/app#main": A } });
    await watcher.check();
    clock.t = 10_000;
    await watcher.check();
    expect(heads).toHaveLength(1);
    clock.t = 31_000;
    await watcher.check();
    expect(heads).toHaveLength(2);
    clock.t = 35_000;
    await watcher.check(true);
    expect(heads).toHaveLength(3);
  });

  it("shares one check between simultaneous callers", async () => {
    const { watcher, heads } = setup({ projects: [project("p1", "me/app", "main", A)], heads: { "me/app#main": A } });
    await Promise.all([watcher.check(), watcher.check()]);
    expect(heads).toHaveLength(1);
  });
});

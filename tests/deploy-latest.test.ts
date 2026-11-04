import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  status: "running" as string,
  exists: true,
  github: true,
  pullFails: false,
  calls: [] as string[],
}));

vi.mock("@/lib/db", () => ({ getProject: () => (state.exists ? { id: "p1", status: state.status } : null) }));
vi.mock("@/lib/redeploy", () => ({
  RedeployError: class RedeployError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  startRedeploy: () => {
    state.calls.push("redeploy");
    return { deployId: "saved-1" };
  },
}));
vi.mock("@/lib/webhooks", () => ({
  githubSourceFor: () => (state.github ? { repo: "me/app", branch: null } : null),
  deployFromPush: async () => {
    state.calls.push("pull");
    if (state.pullFails) throw new Error("GitHub said no");
    return { deployId: "pulled-1" };
  },
}));

const run = async () => (await import("@/lib/deploy-latest")).deployLatest("p1");

beforeEach(() => {
  Object.assign(state, { status: "running", exists: true, github: true, pullFails: false, calls: [] });
});

describe("deployLatest", () => {
  it("pulls the newest code first for a project imported from GitHub", async () => {
    expect(await run()).toEqual({ deployId: "pulled-1", pulled: true, note: null });
    expect(state.calls).toEqual(["pull"]);
  });

  it("falls back to the saved copy, and says why, when the pull fails", async () => {
    state.pullFails = true;
    const result = await run();
    expect(result.deployId).toBe("saved-1");
    expect(result.pulled).toBe(false);
    expect(result.note).toContain("GitHub said no");
    expect(state.calls).toEqual(["pull", "redeploy"]);
  });

  it("rebuilds the saved source for a project that did not come from GitHub", async () => {
    state.github = false;
    expect(await run()).toEqual({ deployId: "saved-1", pulled: false, note: null });
    expect(state.calls).toEqual(["redeploy"]);
  });

  it("refuses a project that is missing or already deploying", async () => {
    state.exists = false;
    await expect(run()).rejects.toThrow("Project not found");
    Object.assign(state, { exists: true, status: "deploying" });
    await expect(run()).rejects.toThrow("already in progress");
    expect(state.calls).toEqual([]);
  });
});

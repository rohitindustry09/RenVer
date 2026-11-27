import { describe, expect, it, vi } from "vitest";
import { needsInstall } from "@/lib/update-plan";
import { createUpdateJob, UpdateError, type UpdateDeps } from "@/lib/update-job";

describe("needsInstall", () => {
  it("is true when the dependency files changed", () => {
    expect(needsInstall(["src/a.ts", "package-lock.json"])).toBe(true);
    expect(needsInstall(["package.json"])).toBe(true);
  });
  it("is false for ordinary changes", () => {
    expect(needsInstall(["src/a.ts", "docs/x.md", "sub/package.json.bak"])).toBe(false);
    expect(needsInstall([])).toBe(false);
  });
});

interface Script {
  head?: string[]; // successive answers to `git rev-parse HEAD`
  changed?: string; // `git diff --name-only`
  codes?: Record<string, number>; // exit code by step label
  supervised?: boolean;
  buildDir?: string | null;
}

function setup(script: Script = {}) {
  const steps: string[] = [];
  const env: Record<string, string | undefined> = {};
  const lines: string[] = [];
  const marks: string[] = [];
  const heads = [...(script.head ?? ["aaa111", "bbb222"])];
  const restart = vi.fn();
  const deps: UpdateDeps = {
    run: async (label, _command, _args, opts, onLine) => {
      steps.push(label);
      if (opts.env?.NEXT_DIST_DIR) env.NEXT_DIST_DIR = opts.env.NEXT_DIST_DIR;
      onLine(`output of ${label}`);
      return script.codes?.[label] ?? 0;
    },
    read: async (_command, args) => (args[0] === "rev-parse" ? (heads.shift() ?? "") : (script.changed ?? "")),
    log: (line) => void lines.push(line),
    resetLog: () => void (lines.length = 0),
    inactiveDir: () => (script.buildDir === undefined ? ".next-alt" : script.buildDir),
    markGood: (dir) => void marks.push(`good ${dir}`),
    markBad: (dir) => void marks.push(`bad ${dir}`),
    isSupervised: script.supervised ?? true,
    restart,
    now: () => 1000,
  };
  return { job: createUpdateJob(deps), steps, env, lines, marks, restart };
}

describe("the update job", () => {
  it("pulls, builds into the spare folder, marks it good and asks for a restart", async () => {
    const { job, steps, env, marks, restart } = setup();
    await job.start({ force: false });
    expect(steps).toEqual(["pull", "build"]);
    expect(env.NEXT_DIST_DIR).toBe(".next-alt");
    expect(marks).toEqual(["good .next-alt"]);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(job.state()).toMatchObject({ status: "restarting" });
  });

  it("installs packages first when the dependency files changed", async () => {
    const { job, steps } = setup({ changed: "src/a.ts\npackage-lock.json\n" });
    await job.start({ force: false });
    expect(steps).toEqual(["pull", "install", "build"]);
  });

  it("stops early when there is nothing new, without building or restarting", async () => {
    const { job, steps, restart } = setup({ head: ["same", "same"] });
    await job.start({ force: false });
    expect(steps).toEqual(["pull"]);
    expect(restart).not.toHaveBeenCalled();
    expect(job.state()).toMatchObject({ status: "done" });
    expect(job.state().message).toMatch(/up to date/i);
  });

  it("builds anyway when asked to, even with nothing new", async () => {
    const { job, steps } = setup({ head: ["same", "same"] });
    await job.start({ force: true });
    expect(steps).toEqual(["pull", "build"]);
  });

  it("fails clearly when the pull fails and builds nothing", async () => {
    const { job, steps, restart } = setup({ codes: { pull: 1 } });
    await job.start({ force: false });
    expect(steps).toEqual(["pull"]);
    expect(restart).not.toHaveBeenCalled();
    expect(job.state()).toMatchObject({ status: "failed" });
    expect(job.state().message).toMatch(/pull/i);
  });

  it("marks the spare build unusable and keeps the panel running when the build fails", async () => {
    const { job, marks, restart } = setup({ codes: { build: 1 } });
    await job.start({ force: false });
    expect(marks).toEqual(["bad .next-alt"]);
    expect(restart).not.toHaveBeenCalled();
    expect(job.state()).toMatchObject({ status: "failed" });
    expect(job.state().message).toMatch(/still running the previous/i);
  });

  it("fails when installing packages fails", async () => {
    const { job, steps } = setup({ changed: "package.json", codes: { install: 1 } });
    await job.start({ force: false });
    expect(steps).toEqual(["pull", "install"]);
    expect(job.state()).toMatchObject({ status: "failed" });
  });

  it("builds without a restart when the panel is not supervised, and says to restart by hand", async () => {
    const { job, restart } = setup({ supervised: false });
    await job.start({ force: false });
    expect(restart).not.toHaveBeenCalled();
    expect(job.state()).toMatchObject({ status: "done" });
    expect(job.state().message).toMatch(/restart/i);
  });

  it("leaves the build folder alone when the owner chose one (no spare folder, nothing to mark)", async () => {
    const { job, env, marks } = setup({ buildDir: null });
    await job.start({ force: false });
    expect(env.NEXT_DIST_DIR).toBeUndefined();
    expect(marks).toEqual([]);
  });

  it("refuses to start a second update while one is running", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = createUpdateJob({
      ...setupDeps(),
      run: async () => {
        await gate;
        return 0;
      },
    });
    const first = slow.start({ force: false });
    await expect(slow.start({ force: false })).rejects.toBeInstanceOf(UpdateError);
    release();
    await first;
  });

  it("keeps the log of what happened", async () => {
    const { job, lines } = setup();
    await job.start({ force: false });
    expect(lines.join("\n")).toContain("output of pull");
    expect(lines.join("\n")).toContain("output of build");
  });
});

function setupDeps(): UpdateDeps {
  return {
    run: async () => 0,
    read: async () => "abc",
    log: () => undefined,
    resetLog: () => undefined,
    inactiveDir: () => ".next-alt",
    markGood: () => undefined,
    markBad: () => undefined,
    isSupervised: true,
    restart: () => undefined,
    now: () => 1,
  };
}

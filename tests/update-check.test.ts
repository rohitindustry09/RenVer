import { describe, expect, it } from "vitest";
import { createUpdateChecker } from "@/lib/update-check";

interface Script {
  upstream?: string | null; // null = no upstream configured
  counts?: string; // "ahead\tbehind"
  log?: string; // pending commits
  current?: string;
  fetchOk?: boolean;
}

function setup(script: Script = {}, start = 0) {
  const clock = { t: start };
  const calls: string[] = [];
  const git = async (args: string[]) => {
    calls.push(args.join(" "));
    if (args[0] === "rev-parse") return script.upstream === null ? { code: 128, out: "" } : { code: 0, out: `${script.upstream ?? "origin/main"}\n` };
    if (args[0] === "fetch") return { code: script.fetchOk === false ? 1 : 0, out: "" };
    if (args[0] === "rev-list") return { code: 0, out: script.counts ?? "0\t0\n" };
    if (args[1] === "-1") return { code: 0, out: script.current ?? "abc1234\tfeat: current\n" };
    return { code: 0, out: script.log ?? "" };
  };
  const checker = createUpdateChecker({ git, now: () => clock.t, minGapMs: 30_000 });
  return { checker, calls, clock };
}

describe("checking GitHub for a newer version", () => {
  it("says up to date when nothing is waiting", async () => {
    const { checker } = setup();
    const result = await checker.check();
    expect(result).toMatchObject({ behind: 0, ahead: 0, commits: [], error: null, upstream: "origin/main" });
    expect(result.current).toEqual({ commit: "abc1234", subject: "feat: current" });
  });

  it("lists the commits that are waiting, newest first", async () => {
    const { checker } = setup({ counts: "0\t2\n", log: "bbb2222\tfix: second\naaa1111\tfeat: first\n" });
    const result = await checker.check();
    expect(result.behind).toBe(2);
    expect(result.commits).toEqual([
      { commit: "bbb2222", subject: "fix: second" },
      { commit: "aaa1111", subject: "feat: first" },
    ]);
  });

  it("reports local commits that GitHub does not have", async () => {
    const { checker } = setup({ counts: "3\t0\n" });
    expect((await checker.check()).ahead).toBe(3);
  });

  it("fetches before it compares", async () => {
    const { checker, calls } = setup();
    await checker.check();
    expect(calls.findIndex((c) => c.startsWith("fetch"))).toBeLessThan(calls.findIndex((c) => c.startsWith("rev-list")));
  });

  it("explains a copy that does not follow a GitHub branch, and does not try to fetch", async () => {
    const { checker, calls } = setup({ upstream: null });
    const result = await checker.check();
    expect(result.upstream).toBeNull();
    expect(result.error).toMatch(/not (tracking|following)/i);
    expect(calls.some((c) => c.startsWith("fetch"))).toBe(false);
  });

  it("still reports what it knows when GitHub cannot be reached, with the reason", async () => {
    const { checker } = setup({ fetchOk: false, counts: "0\t1\n", log: "ccc3333\tfix: x\n" });
    const result = await checker.check();
    expect(result.error).toMatch(/reach GitHub/i);
    expect(result.behind).toBe(1);
  });

  it("does not ask GitHub again within the minimum gap, and does after it", async () => {
    const { checker, calls, clock } = setup();
    await checker.check();
    clock.t = 10_000;
    await checker.check();
    expect(calls.filter((c) => c.startsWith("fetch"))).toHaveLength(1);
    clock.t = 31_000;
    await checker.check();
    expect(calls.filter((c) => c.startsWith("fetch"))).toHaveLength(2);
  });

  it("lets a person force a fresh check, but not several in the same moment", async () => {
    const { checker, calls, clock } = setup();
    await checker.check();
    clock.t = 5_000;
    await checker.check(true);
    expect(calls.filter((c) => c.startsWith("fetch"))).toHaveLength(2);
    clock.t = 5_500;
    await checker.check(true);
    expect(calls.filter((c) => c.startsWith("fetch"))).toHaveLength(2);
  });

  it("shares one check between callers that ask at the same time", async () => {
    const { checker, calls } = setup();
    await Promise.all([checker.check(), checker.check(), checker.check()]);
    expect(calls.filter((c) => c.startsWith("fetch"))).toHaveLength(1);
  });

  it("remembers the last result", async () => {
    const { checker } = setup({ counts: "0\t1\n", log: "ddd4444\tfeat: y\n" });
    expect(checker.last()).toBeNull();
    await checker.check();
    expect(checker.last()?.behind).toBe(1);
  });
});

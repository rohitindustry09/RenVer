import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRunner, type RunnerProcess } from "@/lib/cloudflared-run";

class FakeProcess extends EventEmitter implements RunnerProcess {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill() {
    this.killed = true;
    this.emit("close", 0);
    return true;
  }
}

function setup() {
  const procs: FakeProcess[] = [];
  const spawned: { args: string[]; env: Record<string, string> }[] = [];
  const runner = createRunner({
    binary: () => "cloudflared",
    spawn: (_cmd, args, env) => {
      const proc = new FakeProcess();
      procs.push(proc);
      spawned.push({ args, env });
      return proc;
    },
    restartDelayMs: 1000,
  });
  return { runner, procs, spawned };
}

afterEach(() => vi.useRealTimers());

describe("cloudflared runner", () => {
  it("runs the tunnel with the token in the environment, not on the command line", () => {
    const { runner, spawned } = setup();
    runner.start("secret-token");
    expect(spawned[0]!.env).toMatchObject({ TUNNEL_TOKEN: "secret-token" });
    expect(spawned[0]!.args.join(" ")).not.toContain("secret-token");
    expect(spawned[0]!.args).toEqual(expect.arrayContaining(["tunnel", "run"]));
  });

  it("does not start a second process for the same token", () => {
    const { runner, spawned } = setup();
    runner.start("t");
    runner.start("t");
    expect(spawned).toHaveLength(1);
  });

  it("reports connected once cloudflared registers a connection", () => {
    const { runner, procs } = setup();
    runner.start("t");
    expect(runner.state()).toMatchObject({ running: true, connected: false });
    procs[0]!.stderr.emit("data", Buffer.from("INF Registered tunnel connection connIndex=0\n"));
    expect(runner.state().connected).toBe(true);
  });

  it("restarts after an unexpected exit", () => {
    vi.useFakeTimers();
    const { runner, procs, spawned } = setup();
    runner.start("t");
    procs[0]!.emit("close", 1);
    expect(runner.state().running).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(spawned).toHaveLength(2);
    expect(runner.state().running).toBe(true);
  });

  it("stays stopped after stop()", () => {
    vi.useFakeTimers();
    const { runner, procs, spawned } = setup();
    runner.start("t");
    runner.stop();
    expect(procs[0]!.killed).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(spawned).toHaveLength(1);
    expect(runner.state().running).toBe(false);
  });

  it("restarts with the new token when the token changes", () => {
    const { runner, procs, spawned } = setup();
    runner.start("old");
    runner.start("new");
    expect(procs[0]!.killed).toBe(true);
    expect(spawned[1]!.env.TUNNEL_TOKEN).toBe("new");
  });

  it("explains a missing cloudflared and stops retrying", () => {
    vi.useFakeTimers();
    const { runner, procs, spawned } = setup();
    runner.start("t");
    procs[0]!.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
    vi.advanceTimersByTime(10_000);
    expect(spawned).toHaveLength(1);
    expect(runner.state().error).toMatch(/not installed/i);
  });
});

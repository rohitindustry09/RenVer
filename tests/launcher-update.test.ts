import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DIST_DIRS, inactiveDistDir, pickDistDir, markBuildBad, markBuildGood } from "../scripts/dist-select.mjs";
import { createLogSink } from "../scripts/log-sink.mjs";
import { RESTART_EXIT_CODE, supervise } from "../scripts/supervise.mjs";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-dist-"));
  cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function build(root: string, dir: string, ageSeconds: number): void {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  const id = path.join(root, dir, "BUILD_ID");
  fs.writeFileSync(id, "x");
  const when = new Date(Date.now() - ageSeconds * 1000);
  fs.utimesSync(id, when, when);
}

describe("choosing the build to run", () => {
  it("runs the default folder when it is the only build", () => {
    const root = tempRoot();
    build(root, ".next", 10);
    expect(pickDistDir(root)).toBe(".next");
  });

  it("runs the alternate folder when it holds the newer build", () => {
    const root = tempRoot();
    build(root, ".next", 100);
    build(root, ".next-alt", 5);
    expect(pickDistDir(root)).toBe(".next-alt");
  });

  it("runs the default folder when a manual build there is newer", () => {
    const root = tempRoot();
    build(root, ".next-alt", 100);
    build(root, ".next", 5);
    expect(pickDistDir(root)).toBe(".next");
  });

  it("ignores a folder without a finished build", () => {
    const root = tempRoot();
    build(root, ".next", 100);
    fs.mkdirSync(path.join(root, ".next-alt"), { recursive: true });
    expect(pickDistDir(root)).toBe(".next");
  });

  it("falls back to the default folder when nothing has been built", () => {
    expect(pickDistDir(tempRoot())).toBe(".next");
  });

  it("builds into the folder that is not running", () => {
    const root = tempRoot();
    build(root, ".next", 100);
    expect(inactiveDistDir(root)).toBe(".next-alt");
    build(root, ".next-alt", 5);
    expect(inactiveDistDir(root)).toBe(".next");
  });

  it("marks a finished build as the newest and a failed one as unusable", () => {
    const root = tempRoot();
    build(root, ".next", 100);
    build(root, ".next-alt", 500);
    markBuildGood(root, ".next-alt");
    expect(pickDistDir(root)).toBe(".next-alt");
    markBuildBad(root, ".next-alt");
    expect(pickDistDir(root)).toBe(".next");
  });

  it("only knows the two folders", () => {
    expect([...DIST_DIRS]).toEqual([".next", ".next-alt"]);
  });
});

describe("the panel log file", () => {
  it("appends text and starts a new file when it grows too big", () => {
    const root = tempRoot();
    const file = path.join(root, "logs", "panel.log");
    const sink = createLogSink(file, 30);
    sink.write("first line\n");
    sink.write("second line\n");
    sink.write("third line\n");
    expect(fs.readFileSync(file, "utf8")).toContain("third line");
    expect(fs.existsSync(`${file}.1`)).toBe(true);
    expect(fs.readFileSync(`${file}.1`, "utf8")).toContain("first line");
  });

  it("never throws when the file cannot be written", () => {
    const root = tempRoot();
    const blocker = path.join(root, "blocker");
    fs.writeFileSync(blocker, "not a folder");
    const sink = createLogSink(path.join(blocker, "panel.log"), 100);
    expect(() => sink.write("hello\n")).not.toThrow();
  });
});

describe("keeping the panel running", () => {
  const exit = (code: number | null, signal: string | null = null) => ({ code, signal });

  function setup(exits: { code: number | null; signal: string | null }[], dirs: string[]) {
    const started: string[] = [];
    const bad: string[] = [];
    const logs: string[] = [];
    let clock = 0;
    const result = supervise({
      pick: () => dirs.shift() ?? ".next",
      spawnChild: async (dir: string) => {
        started.push(dir);
        clock += 1000;
        return exits.shift() ?? exit(0);
      },
      markBad: (dir: string) => void bad.push(dir),
      now: () => clock,
      log: (line: string) => void logs.push(line),
    });
    return { result, started, bad, logs };
  }

  it("starts again after a requested restart, with whichever build is newest", async () => {
    const { result, started } = setup([exit(RESTART_EXIT_CODE), exit(0)], [".next", ".next-alt"]);
    expect(await result).toEqual({ code: 0, signal: null });
    expect(started).toEqual([".next", ".next-alt"]);
  });

  it("stops when the panel exits normally or is stopped by a signal", async () => {
    expect((await setup([exit(0)], [".next"]).result).code).toBe(0);
    expect((await setup([exit(null, "SIGINT")], [".next"]).result).signal).toBe("SIGINT");
  });

  it("returns the exit code of a crash that was not caused by an update", async () => {
    const { result, started } = setup([exit(1)], [".next"]);
    expect((await result).code).toBe(1);
    expect(started).toHaveLength(1);
  });

  it("falls back to the previous build when a freshly updated build crashes at once", async () => {
    const { result, started, bad } = setup([exit(RESTART_EXIT_CODE), exit(1), exit(0)], [".next", ".next-alt", ".next"]);
    expect(await result).toEqual({ code: 0, signal: null });
    expect(started).toEqual([".next", ".next-alt", ".next"]);
    expect(bad).toEqual([".next-alt"]);
  });

  it("does not fall back forever: a crash of the same build again ends it", async () => {
    const { result, started } = setup([exit(RESTART_EXIT_CODE), exit(1), exit(1)], [".next", ".next-alt", ".next"]);
    expect((await result).code).toBe(1);
    expect(started).toHaveLength(3);
  });
});

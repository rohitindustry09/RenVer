import { spawn } from "node:child_process";
import { createUpdateChecker } from "./update-check";

type Checker = ReturnType<typeof createUpdateChecker>;

const GIT_TIMEOUT_MS = 30_000;
const CHECK_GAP_MS = 30_000;

/** Runs git in the project folder. It never asks for a password (that would hang the check) and never throws. */
function runGit(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    const child = spawn("git", args, { cwd: process.cwd(), env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, windowsHide: true });
    let out = "";
    const timer = setTimeout(() => child.kill(), GIT_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => void (out += chunk.toString("utf8")));
    child.on("error", () => {
      clearTimeout(timer);
      done({ code: 127, out: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: code ?? 1, out });
    });
  });
}

const globalKey = Symbol.for("renver.updateChecker");
type Holder = { [globalKey]?: Checker };

/** The one checker of this process: looks at GitHub for a newer RenVer, at most every 30 seconds. */
export function updateChecker(): Checker {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createUpdateChecker({ git: runGit, now: Date.now, minGapMs: CHECK_GAP_MS });
  return holder[globalKey];
}

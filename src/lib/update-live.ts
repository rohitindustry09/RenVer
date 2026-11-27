import { spawn } from "node:child_process";
import path from "node:path";
import { inactiveDistDir, markBuildBad, markBuildGood } from "../../scripts/dist-select.mjs";
import { RESTART_EXIT_CODE } from "../../scripts/supervise.mjs";
import { cloudflaredRunner } from "./cloudflared-run";
import { appendLog, resetLog } from "./logs";
import { tunnels } from "./tunnels";
import { createUpdateJob, type StepLabel } from "./update-job";

type Job = ReturnType<typeof createUpdateJob>;

const RESTART_DELAY_MS = 1500;
const LINE_BREAK = new RegExp("\\r?\\n");
const UPDATE_LOG_ID = "update";

interface Resolved {
  command: string;
  args: string[];
  shell: boolean;
}

/** The program for a step. Next and npm run through this same Node, so no shell and no PATH lookups are needed. */
function resolve(command: string, args: string[]): Resolved {
  if (command === "next") {
    const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
    return { command: process.execPath, args: [nextBin, ...args], shell: false };
  }
  if (command === "npm") {
    const npmCli = process.env.npm_execpath;
    if (npmCli && /\.c?js$/i.test(npmCli)) return { command: process.execPath, args: [npmCli, ...args], shell: false };
    // Fixed arguments only, so the shell Windows needs for npm.cmd cannot be given anything from outside.
    return process.platform === "win32" ? { command: "npm.cmd", args, shell: true } : { command: "npm", args, shell: false };
  }
  return { command, args, shell: false };
}

function runStep(
  _label: StepLabel,
  command: string,
  args: string[],
  opts: { env?: Record<string, string> },
  onLine: (line: string) => void,
): Promise<number> {
  const program = resolve(command, args);
  return new Promise((done) => {
    const child = spawn(program.command, program.args, {
      cwd: process.cwd(),
      env: { ...process.env, ...opts.env },
      windowsHide: true,
      shell: program.shell,
    });
    let pending = "";
    const feed = (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split(LINE_BREAK);
      pending = lines.pop() ?? "";
      lines.forEach(onLine);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", (error) => {
      onLine(`Could not run ${command}: ${error.message}`);
      done(127);
    });
    child.on("close", (code) => {
      if (pending) onLine(pending);
      done(code ?? 1);
    });
  });
}

function readOutput(command: string, args: string[]): Promise<string> {
  const program = resolve(command, args);
  return new Promise((done) => {
    const child = spawn(program.command, program.args, { cwd: process.cwd(), windowsHide: true, shell: program.shell });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => void (out += chunk.toString("utf8")));
    child.on("error", () => done(""));
    child.on("close", (code) => done(code === 0 ? out : ""));
  });
}

/** Stops what the panel started (tunnel processes), then leaves with the code the launcher treats as "start me again". */
function restartPanel(): void {
  cloudflaredRunner().stop();
  tunnels().stopAll();
  setTimeout(() => process.exit(RESTART_EXIT_CODE), RESTART_DELAY_MS);
}

const globalKey = Symbol.for("renver.update");
type Holder = { [globalKey]?: Job };

/** The one update job of this process, wired to git, the build and the launcher's restart. */
export function updateJob(): Job {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createUpdateJob({
    run: runStep,
    read: readOutput,
    log: (line) => appendLog(UPDATE_LOG_ID, line),
    resetLog: () => resetLog(UPDATE_LOG_ID),
    // When the owner chose the build folder (NEXT_DIST_DIR), the launcher does not switch folders, so neither do we.
    inactiveDir: () => (process.env.NEXT_DIST_DIR ? null : inactiveDistDir(process.cwd())),
    markGood: (dir) => markBuildGood(process.cwd(), dir),
    markBad: (dir) => markBuildBad(process.cwd(), dir),
    isSupervised: process.env.RENVER_SUPERVISED === "1",
    restart: restartPanel,
    now: Date.now,
  });
  return holder[globalKey];
}

export const UPDATE_LOG = UPDATE_LOG_ID;

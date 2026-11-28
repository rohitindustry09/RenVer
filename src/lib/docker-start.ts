import { spawn } from "node:child_process";
import { resolveBinary } from "./binaries";

export interface DockerStartPlan {
  command: string;
  args: string[];
  description: string;
  /** True when the program keeps running on its own (Docker Desktop), so there is nothing to wait for. */
  isDetached: boolean;
}

export type DockerStartResult = { ok: true; plan: DockerStartPlan } | { ok: false; error: string };

type Env = Record<string, string | undefined>;

const DEFAULT_PROGRAM_FILES = "C:\\Program Files";
const RESTART_GUARD_MS = 2 * 60 * 1000;

/** Single-quotes a value for PowerShell, doubling any quotes inside it. */
const psQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** Where Docker Desktop is installed by default. */
const dockerDesktopExe = (env: Env): string => `${env.ProgramFiles || DEFAULT_PROGRAM_FILES}\\Docker\\Docker\\Docker Desktop.exe`;

/** How to start Docker on this system, without ever using anything that came from outside. */
export function dockerStartPlan(platform: string, isAdmin: boolean, env: Env): DockerStartResult {
  if (platform === "win32") {
    const exe = dockerDesktopExe(env);
    return {
      ok: true,
      plan: {
        command: "powershell.exe",
        // Start-Process returns as soon as Docker Desktop has started; if it cannot be started this exits with an error.
        args: ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference = 'Stop'; Start-Process -FilePath ${psQuote(exe)}`],
        description: "Start Docker Desktop",
        isDetached: false,
      },
    };
  }
  if (platform === "darwin") {
    return { ok: true, plan: { command: "open", args: ["-a", "Docker"], description: "Open Docker Desktop", isDetached: true } };
  }
  if (platform === "linux") {
    if (!isAdmin) return { ok: false, error: "Starting the Docker service needs root. Run the panel as root, or run: sudo systemctl start docker" };
    return { ok: true, plan: { command: "systemctl", args: ["start", "docker"], description: "systemctl start docker", isDetached: false } };
  }
  return { ok: false, error: `Starting Docker automatically is not supported on ${platform}.` };
}

/** How to restart Docker when it runs but its engine never answers. On Windows this also shuts WSL down. */
export function dockerRestartPlan(platform: string, isAdmin: boolean, env: Env): DockerStartResult {
  if (platform === "win32") {
    const exe = dockerDesktopExe(env);
    const script = [
      // Closing things that are not there is fine, so errors are ignored until the final start.
      "$ErrorActionPreference = 'SilentlyContinue'",
      "Stop-Process -Name 'Docker Desktop' -Force",
      "Stop-Process -Name 'com.docker.backend' -Force",
      "wsl.exe --shutdown",
      "Start-Sleep -Seconds 3",
      "$ErrorActionPreference = 'Stop'",
      `Start-Process -FilePath ${psQuote(exe)}`,
    ].join("; ");
    return { ok: true, plan: { command: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", script], description: "Restart Docker Desktop and WSL", isDetached: false } };
  }
  if (platform === "linux") {
    if (!isAdmin) return { ok: false, error: "Restarting the Docker service needs root. Run the panel as root, or run: sudo systemctl restart docker" };
    return { ok: true, plan: { command: "systemctl", args: ["restart", "docker"], description: "systemctl restart docker", isDetached: false } };
  }
  return dockerStartPlan(platform, isAdmin, env);
}

export type StartOutcome = { ok: true; message: string } | { ok: false; error: string };

let lastStartAt = 0;

function launch(result: DockerStartResult, now: number): Promise<StartOutcome> {
  if (!result.ok) return Promise.resolve({ ok: false, error: result.error });
  if (now - lastStartAt < RESTART_GUARD_MS) return Promise.resolve({ ok: true, message: "Docker is already starting. This can take a minute or two." });
  lastStartAt = now;

  const { plan } = result;
  return new Promise((done) => {
    const child = spawn(plan.command, plan.args, { stdio: "ignore", detached: plan.isDetached, windowsHide: true });
    child.on("error", (error) => {
      lastStartAt = 0;
      done({ ok: false, error: `Could not start Docker: ${error.message}. If it is not installed, install it first.` });
    });
    if (plan.isDetached) {
      child.unref();
      child.on("spawn", () => done({ ok: true, message: "Docker is starting. This can take a minute or two." }));
      return;
    }
    child.on("close", (code) => {
      if (code === 0) return done({ ok: true, message: "Docker is starting. This can take a minute or two." });
      lastStartAt = 0;
      done({
        ok: false,
        error:
          process.platform === "win32"
            ? "Docker Desktop could not be started. Open it from the Start menu once (it must be installed and you must be signed in to Windows), then press Check again."
            : `Docker did not start (exit ${code}).`,
      });
    });
  });
}

const isRoot = (): boolean => (typeof process.getuid === "function" ? process.getuid() === 0 : true);

/** Starts Docker (once per couple of minutes). Docker then needs a while to come up: the caller watches until it answers. */
export function startDocker(now: number = Date.now()): Promise<StartOutcome> {
  return launch(dockerStartPlan(process.platform, isRoot(), process.env), now);
}

/** Restarts Docker (and WSL on Windows) when its engine is stuck. Once per couple of minutes, like starting. */
export function restartDocker(now: number = Date.now()): Promise<StartOutcome> {
  return launch(dockerRestartPlan(process.platform, isRoot(), process.env), now);
}

const CHECK_TIMEOUT_MS = 6000;

/** Whether the Docker engine answers right now. A quick check on its own, much lighter than the full system check. */
export function isDockerRunning(): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(resolveBinary("docker"), ["info", "--format", "{{.ServerVersion}}"], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let out = "";
    const timer = setTimeout(() => child.kill(), CHECK_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => void (out += chunk.toString("utf8")));
    child.on("error", () => {
      clearTimeout(timer);
      done(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done(code === 0 && out.trim() !== "");
    });
  });
}

import { spawn } from "node:child_process";

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

/** How to start Docker on this system, without ever using anything that came from outside. */
export function dockerStartPlan(platform: string, isAdmin: boolean, env: Env): DockerStartResult {
  if (platform === "win32") {
    const exe = `${env.ProgramFiles || DEFAULT_PROGRAM_FILES}\\Docker\\Docker\\Docker Desktop.exe`;
    return {
      ok: true,
      plan: {
        command: "powershell.exe",
        args: ["-NoProfile", "-NonInteractive", "-Command", `Start-Process -FilePath ${psQuote(exe)}`],
        description: "Start Docker Desktop",
        isDetached: true,
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

export type StartOutcome = { ok: true; message: string } | { ok: false; error: string };

let lastStartAt = 0;

/** Starts Docker (once per couple of minutes). Docker then needs a while to come up: the caller watches the Setup checks. */
export function startDocker(now: number = Date.now()): Promise<StartOutcome> {
  const isAdmin = typeof process.getuid === "function" ? process.getuid() === 0 : true;
  const result = dockerStartPlan(process.platform, isAdmin, process.env);
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
      if (code === 0) return done({ ok: true, message: "Docker is starting." });
      lastStartAt = 0;
      done({ ok: false, error: `The Docker service did not start (exit ${code}).` });
    });
  });
}

import { spawn as nodeSpawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import { resolveBinary } from "./binaries";

const RESTART_DELAY_MS = 5000;
const CONNECTED = /registered tunnel connection/i;

export interface RunnerProcess extends EventEmitter {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  kill(): boolean;
}

interface Deps {
  binary: () => string;
  spawn: (command: string, args: string[], env: Record<string, string>) => RunnerProcess;
  restartDelayMs: number;
}

export interface RunnerState {
  running: boolean;
  connected: boolean;
  error: string | null;
}

/**
 * Keeps the Cloudflare tunnel's `cloudflared` process alive while RenVer runs. The token goes in the environment so
 * it never shows up in a process list. If cloudflared dies it is started again, unless it is not installed.
 */
export function createRunner(deps: Deps) {
  let proc: RunnerProcess | null = null;
  let token: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isConnected = false;
  let error: string | null = null;

  function launch(): void {
    if (!token) return;
    const child = deps.spawn(deps.binary(), ["tunnel", "--no-autoupdate", "run"], { TUNNEL_TOKEN: token });
    proc = child;
    isConnected = false;
    const watch = (chunk: Buffer | string) => {
      if (CONNECTED.test(chunk.toString())) isConnected = true;
    };
    child.stdout?.on("data", watch);
    child.stderr?.on("data", watch);
    child.on("error", (e: NodeJS.ErrnoException) => {
      if (proc !== child) return;
      proc = null;
      isConnected = false;
      if (e.code === "ENOENT") {
        error = "cloudflared is not installed. Install it from the Setup page.";
        token = null;
      } else {
        error = `cloudflared could not start: ${e.message}`;
        timer = setTimeout(launch, deps.restartDelayMs);
      }
    });
    child.on("close", () => {
      if (proc !== child) return;
      proc = null;
      isConnected = false;
      if (token) timer = setTimeout(launch, deps.restartDelayMs);
    });
  }

  function stop(): void {
    token = null;
    clearTimeout(timer);
    const current = proc;
    proc = null;
    isConnected = false;
    current?.kill();
  }

  return {
    start(newToken: string): void {
      if (proc && token === newToken) return;
      stop();
      token = newToken;
      error = null;
      launch();
    },
    stop,
    state: (): RunnerState => ({ running: proc !== null, connected: isConnected, error }),
  };
}

/** One runner per process, kept on globalThis so Next.js reloads in development don't leave a second tunnel running. */
const globalKey = Symbol.for("renver.cloudflared");
type Holder = { [globalKey]?: ReturnType<typeof createRunner> };

export function cloudflaredRunner(): ReturnType<typeof createRunner> {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createRunner({
    binary: () => resolveBinary("cloudflared"),
    spawn: (command, args, env) => nodeSpawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }),
    restartDelayMs: RESTART_DELAY_MS,
  });
  return holder[globalKey];
}

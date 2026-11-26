import { spawn as nodeSpawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import { resolveBinary } from "./binaries";
import { parseTunnelUrl } from "./tunnel-url";

const START_TIMEOUT_MS = 30_000;
const LINE_BREAK = new RegExp("\\r?\\n");

export class TunnelError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

export interface TunnelProcess extends EventEmitter {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  kill(): boolean;
}

interface Deps {
  binary: () => string;
  spawn: (command: string, args: string[]) => TunnelProcess;
  timeoutMs: number;
}

interface Entry {
  proc: TunnelProcess;
  url: string | null;
  ready: Promise<string>;
}

/**
 * Cloudflare "quick tunnels": cloudflared connects out to Cloudflare, which gives the app a temporary public
 * https://<random>.trycloudflare.com address. No account, DNS record or open port is needed. The address changes
 * every time a tunnel is started, and tunnels live only as long as the panel does.
 */
export function createTunnelManager(deps: Deps) {
  const tunnels = new Map<string, Entry>();

  function begin(projectId: string, hostPort: number): Entry {
    const args = ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${hostPort}`];
    const proc = deps.spawn(deps.binary(), args);
    const entry: Entry = { proc, url: null, ready: Promise.resolve("") };
    entry.ready = new Promise<string>((resolve, reject) => {
      let isSettled = false;
      const fail = (error: TunnelError) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        if (tunnels.get(projectId) === entry) tunnels.delete(projectId);
        proc.kill();
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new TunnelError("Cloudflare did not give an address in time. Check the server's internet connection and try again.", 504)),
        deps.timeoutMs,
      );
      let pendingUrl: string | null = null;
      const onData = (chunk: Buffer | string) => {
        if (entry.url) return;
        for (const line of chunk.toString().split(LINE_BREAK)) {
          pendingUrl ??= parseTunnelUrl(line);
          // cloudflared prints the address before Cloudflare's DNS knows it; wait until the tunnel is connected.
          if (pendingUrl && /registered tunnel connection/i.test(line)) {
            entry.url = pendingUrl;
            isSettled = true;
            clearTimeout(timer);
            resolve(pendingUrl);
            return;
          }
        }
      };
      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData);
      proc.on("error", (error: NodeJS.ErrnoException) => {
        fail(
          error.code === "ENOENT"
            ? new TunnelError("cloudflared is not installed. Install it from the Setup page, then try again.", 424)
            : new TunnelError(`Could not start the tunnel: ${error.message}`),
        );
      });
      proc.on("close", () => {
        if (tunnels.get(projectId) === entry) tunnels.delete(projectId);
        if (!entry.url) fail(new TunnelError("The tunnel closed before it got an address."));
      });
    });
    entry.ready.catch(() => undefined);
    tunnels.set(projectId, entry);
    return entry;
  }

  return {
    /** Starts a tunnel to the app's local port (or joins the one already starting) and resolves to its public address. */
    start(projectId: string, hostPort: number): Promise<string> {
      return (tunnels.get(projectId) ?? begin(projectId, hostPort)).ready;
    },
    get(projectId: string): { url: string } | null {
      const url = tunnels.get(projectId)?.url;
      return url ? { url } : null;
    },
    stop(projectId: string): void {
      const entry = tunnels.get(projectId);
      if (!entry) return;
      tunnels.delete(projectId);
      entry.proc.kill();
    },
  };
}

/** One manager per process, kept on globalThis so Next.js reloads in development don't orphan running tunnels. */
const globalKey = Symbol.for("renver.tunnels");
type Holder = { [globalKey]?: ReturnType<typeof createTunnelManager> };

export function tunnels(): ReturnType<typeof createTunnelManager> {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createTunnelManager({
    binary: () => resolveBinary("cloudflared"),
    spawn: (command, args) => nodeSpawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }),
    timeoutMs: START_TIMEOUT_MS,
  });
  return holder[globalKey];
}

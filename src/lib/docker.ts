import { spawn } from "node:child_process";
import net from "node:net";
import { config } from "./config";
import { parseDockerStats, type ContainerStats } from "./docker-stats";
import { getLimits } from "./runtime-settings";
import { isReservedEnvKey } from "./validate";

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEALTH_INTERVAL_MS = 2000;
const HEALTH_REQUEST_TIMEOUT_MS = 3000;

export type LineHandler = (line: string) => void;

const BUILD_TIMEOUT_MS = 20 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 2 * 60 * 1000;
const PIDS_LIMIT = "512";
/** Containers keep only what common images (nginx, node) need to start and bind ports. */
const KEPT_CAPABILITIES = ["CHOWN", "SETUID", "SETGID", "NET_BIND_SERVICE"];

function validEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => ENV_KEY_PATTERN.test(key) && !isReservedEnvKey(key)),
  );
}

function runStreaming(
  args: string[],
  opts: {
    cwd?: string;
    env?: Record<string, string>;
    onLine?: LineHandler;
    timeoutMs?: number;
  },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      opts.onLine?.(`docker ${args[0]} timed out after ${Math.round((opts.timeoutMs ?? COMMAND_TIMEOUT_MS) / 1000)}s`);
      child.kill();
    }, opts.timeoutMs ?? COMMAND_TIMEOUT_MS);
    let pending = "";
    const feed = (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      lines.forEach((line) => opts.onLine?.(line));
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (pending) opts.onLine?.(pending);
      resolve(code ?? 1);
    });
  });
}

export async function dockerBuild(opts: {
  contextDir: string;
  tag: string;
  buildEnv: Record<string, string>;
  onLine: LineHandler;
}): Promise<void> {
  const env = validEnv(opts.buildEnv);
  const args = ["build", "-t", opts.tag, ...Object.keys(env).flatMap((k) => ["--build-arg", k]), "."];
  const code = await runStreaming(args, {
    cwd: opts.contextDir,
    env,
    onLine: opts.onLine,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  if (code !== 0) throw new Error(`docker build failed (exit ${code})`);
}

export async function dockerRun(opts: {
  name: string;
  tag: string;
  hostPort: number;
  containerPort: number;
  projectId: string;
  runtimeEnv: Record<string, string>;
  /** Memory and CPU for this container. Defaults to the global limits. */
  limits?: { memory: string; cpus: string };
  onLine: LineHandler;
}): Promise<void> {
  const env = validEnv(opts.runtimeEnv);
  const limits = opts.limits ?? getLimits();
  const args = [
    "run", "-d",
    "--name", opts.name,
    "--label", `renver.project=${opts.projectId}`,
    "--restart", "unless-stopped",
    "--memory", limits.memory,
    "--memory-swap", limits.memory,
    "--cpus", limits.cpus,
    "--pids-limit", PIDS_LIMIT,
    "--network", APP_NETWORK,
    "--security-opt", "no-new-privileges",
    "--cap-drop", "ALL",
    ...KEPT_CAPABILITIES.flatMap((cap) => ["--cap-add", cap]),
    "-p", `127.0.0.1:${opts.hostPort}:${opts.containerPort}`,
    ...Object.keys(env).flatMap((k) => ["-e", k]),
    opts.tag,
  ];
  const code = await runStreaming(args, { env, onLine: opts.onLine });
  if (code !== 0) throw new Error(`docker run failed (exit ${code})`);
}

/** Changes the limits of a container that is already running, without restarting it. */
export async function dockerUpdateLimits(name: string, memory: string, cpus: string): Promise<void> {
  // Swap is set equal to memory so lowering the limit is accepted and an app that goes over is stopped, not slowed.
  const code = await runStreaming(["update", "--memory", memory, "--memory-swap", memory, "--cpus", cpus, name], {
    timeoutMs: EXEC_TIMEOUT_MS,
  });
  if (code !== 0) throw new Error(`docker update failed for ${name} (exit ${code})`);
}

/** Apps and databases share this network, so an app reaches a database by its container name. */
export const APP_NETWORK = "renver";
const DATABASE_MEMORY = "1g";
const DB_READY_INTERVAL_MS = 2000;
const DB_READY_TIMEOUT_MS = 3 * 60 * 1000;
const EXEC_TIMEOUT_MS = 30 * 1000;
const IMAGE_PULL_TIMEOUT_MS = 10 * 60 * 1000;

export async function ensureNetwork(name: string = APP_NETWORK): Promise<void> {
  if ((await runStreaming(["network", "inspect", name], {})) === 0) return;
  const code = await runStreaming(["network", "create", name], {});
  if (code !== 0) throw new Error(`Could not create the "${name}" Docker network.`);
}

export async function dockerRunDatabase(opts: {
  name: string;
  image: string;
  volume: string;
  dataDir: string;
  databaseId: string;
  env: Record<string, string>;
  onLine: LineHandler;
}): Promise<void> {
  const env = validEnv(opts.env);
  const args = [
    "run", "-d",
    "--name", opts.name,
    "--label", "renver.kind=database",
    "--label", `renver.database=${opts.databaseId}`,
    "--restart", "unless-stopped",
    "--memory", DATABASE_MEMORY,
    "--pids-limit", PIDS_LIMIT,
    "--network", APP_NETWORK,
    "-v", `${opts.volume}:${opts.dataDir}`,
    ...Object.keys(env).flatMap((k) => ["-e", k]),
    opts.image,
  ];
  const code = await runStreaming(args, { env, onLine: opts.onLine, timeoutMs: IMAGE_PULL_TIMEOUT_MS });
  if (code !== 0) throw new Error(`docker run failed (exit ${code})`);
}

export async function dockerExec(container: string, command: string[]): Promise<number> {
  return runStreaming(["exec", container, ...command], { timeoutMs: EXEC_TIMEOUT_MS });
}

/** Resolves once the probe command succeeds inside the container; rejects after the timeout. */
export async function waitForProbe(container: string, probe: string[]): Promise<void> {
  const deadline = Date.now() + DB_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await dockerExec(container, probe).catch(() => 1)) === 0) return;
    await new Promise((r) => setTimeout(r, DB_READY_INTERVAL_MS));
  }
  throw new Error("The database did not become ready in time.");
}

export async function dockerStart(name: string): Promise<void> {
  const code = await runStreaming(["start", name], { timeoutMs: EXEC_TIMEOUT_MS });
  if (code !== 0) throw new Error(`docker start failed for ${name} (exit ${code})`);
}

export async function dockerRemoveVolume(name: string): Promise<void> {
  await runStreaming(["volume", "rm", "-f", name], {});
}

/** Names of running containers carrying a label, used to reconcile stored status with reality. */
export async function runningContainerNames(label: string): Promise<string[]> {
  const names: string[] = [];
  const code = await runStreaming(["ps", "--filter", `label=${label}`, "--format", "{{.Names}}"], {
    onLine: (line) => line.trim() && names.push(line.trim()),
    timeoutMs: EXEC_TIMEOUT_MS,
  });
  if (code !== 0) throw new Error("Could not list containers.");
  return names;
}

/** Whether Docker has a container with this name (running or not). */
export async function dockerContainerExists(name: string): Promise<boolean> {
  return (await runStreaming(["container", "inspect", name], { timeoutMs: EXEC_TIMEOUT_MS })) === 0;
}

export async function dockerStop(name: string): Promise<void> {
  const code = await runStreaming(["stop", "--time", "15", name], { timeoutMs: EXEC_TIMEOUT_MS });
  if (code !== 0) throw new Error(`docker stop failed for ${name} (exit ${code})`);
}

export async function dockerRestart(name: string): Promise<void> {
  const code = await runStreaming(["restart", "--time", "15", name], { timeoutMs: EXEC_TIMEOUT_MS });
  if (code !== 0) throw new Error(`docker restart failed for ${name} (exit ${code})`);
}

/** The last lines the app wrote, oldest first, with its normal and error output together. */
export async function dockerLogsTail(name: string, lines: number): Promise<string[]> {
  const out: string[] = [];
  const code = await runStreaming(["logs", "--tail", String(lines), "--timestamps", name], {
    onLine: (line) => out.push(line),
    timeoutMs: EXEC_TIMEOUT_MS,
  });
  if (code !== 0) throw new Error("Could not read the app's logs.");
  return out;
}

/** Current CPU and memory use of a running container, or null if it cannot be read. */
export async function dockerStats(name: string): Promise<ContainerStats | null> {
  let parsed: ContainerStats | null = null;
  const code = await runStreaming(["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}", name], {
    onLine: (line) => {
      parsed ??= parseDockerStats(line);
    },
    timeoutMs: EXEC_TIMEOUT_MS,
  });
  return code === 0 ? parsed : null;
}

export async function dockerRemove(name: string): Promise<void> {
  await runStreaming(["rm", "-f", name], {});
}

const BUILD_CACHE_KEEP = "168h";
const PRUNE_TIMEOUT_MS = 5 * 60 * 1000;

/** Frees build cache older than a week. Recent cache is kept so the next deploy of the same app stays fast. */
export async function dockerPruneBuildCache(): Promise<void> {
  await runStreaming(["builder", "prune", "--force", "--filter", `until=${BUILD_CACHE_KEEP}`], { timeoutMs: PRUNE_TIMEOUT_MS });
}

export async function dockerRemoveImage(tag: string): Promise<void> {
  await runStreaming(["rmi", tag], {});
}

export async function containerLogs(name: string, onLine: LineHandler): Promise<void> {
  await runStreaming(["logs", "--tail", "40", name], { onLine });
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

/** Resolves once the app answers any HTTP request; rejects after the timeout. */
export async function waitHealthy(port: number, timeoutMs = config.healthTimeoutMs): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
    }
  }
  throw new Error(`App did not respond on port ${port} within ${Math.round(timeoutMs / 1000)}s`);
}

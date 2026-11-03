import { execFile } from "node:child_process";
import { readFile, statfs } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import { promisify } from "node:util";
import { resolveBinary } from "./binaries.ts";
import type { SystemInfo, ToolVersions } from "./preflight.ts";

const run = promisify(execFile);
const COMMAND_TIMEOUT_MS = 8000;
const PORTS_TO_PROBE = [80, 443, 3000];
const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;

async function commandOutput(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(resolveBinary(cmd), args, { timeout: COMMAND_TIMEOUT_MS, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

function firstVersion(text: string | null): string | null {
  return text?.match(/\d+\.\d+(\.\d+)?/)?.[0] ?? null;
}

async function collectTools(): Promise<ToolVersions> {
  const [docker, dockerInfo, compose, caddy, git] = await Promise.all([
    commandOutput("docker", ["--version"]),
    commandOutput("docker", ["info", "--format", "{{.ServerVersion}}"]),
    commandOutput("docker", ["compose", "version"]),
    commandOutput("caddy", ["version"]),
    commandOutput("git", ["--version"]),
  ]);
  return {
    docker: firstVersion(docker),
    dockerRunning: dockerInfo !== null && dockerInfo.length > 0,
    compose: firstVersion(compose),
    caddy: firstVersion(caddy),
    git: firstVersion(git),
    node: process.versions.node,
  };
}

async function readOsRelease(): Promise<{ id: string; version: string }> {
  if (process.platform === "win32") {
    return { id: "windows", version: os.release() };
  }
  if (process.platform === "darwin") {
    return { id: "macos", version: os.release() };
  }
  try {
    const text = await readFile("/etc/os-release", "utf8");
    const field = (key: string) =>
      text.match(new RegExp(`^${key}=("?)(.*)\\1$`, "m"))?.[2] ?? "";
    return { id: field("ID"), version: field("VERSION_ID") };
  } catch {
    return { id: "unknown", version: "" };
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

async function freeDiskGB(): Promise<number> {
  const stats = await statfs(process.cwd());
  return Math.floor((stats.bavail * stats.bsize) / BYTES_PER_GB);
}

export async function collectSystemInfo(): Promise<SystemInfo> {
  const [tools, osRelease, disk, portResults] = await Promise.all([
    collectTools(),
    readOsRelease(),
    freeDiskGB(),
    Promise.all(PORTS_TO_PROBE.map(async (p) => ({ p, free: await isPortFree(p) }))),
  ]);
  return {
    platform: process.platform,
    osId: osRelease.id,
    osVersion: osRelease.version,
    arch: process.arch,
    totalMemMB: Math.floor(os.totalmem() / BYTES_PER_MB),
    freeDiskGB: disk,
    isAdmin: typeof process.getuid === "function" ? process.getuid() === 0 : true,
    tools,
    portsInUse: portResults.filter((r) => !r.free).map((r) => r.p),
  };
}

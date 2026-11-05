import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseDockerDf, type DockerDf } from "./cleanup";
import { DatabaseError } from "./databases";

const run = promisify(execFile);
const SCAN_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 64 * 1024 * 1024;

/** Runs `docker <args>` and returns what it printed. Injectable, so tests can pretend to be Docker. */
export type DockerRunner = (args: string[], timeoutMs: number) => Promise<string>;

export const realDocker: DockerRunner = async (args, timeoutMs) => {
  try {
    const { stdout } = await run("docker", args, { timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true });
    return stdout;
  } catch (error) {
    const detail = (error as { stderr?: string }).stderr?.trim().split(/\r?\n/).at(-1);
    throw new DatabaseError(`Docker could not do that: ${detail || (error instanceof Error ? error.message : "unknown error")}`, 502);
  }
};

/** Docker's own account of disk use: images, containers' writable layers, volumes and build cache. */
export async function readDockerDf(docker: DockerRunner = realDocker): Promise<DockerDf> {
  return parseDockerDf(JSON.parse(await docker(["system", "df", "-v", "--format", "json"], SCAN_TIMEOUT_MS)));
}

import { spawn } from "node:child_process";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

const TIMEOUT_MS = 30 * 60 * 1000;
const MAX_STDERR_CHARS = 4000;

/** The last meaningful line of a tool's error output, for showing to a person. */
function lastLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) ?? "no details";
}

function start(args: string[]) {
  const child = spawn("docker", args, { windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < MAX_STDERR_CHARS) stderr += chunk.toString("utf8");
  });
  const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
  const exited = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
  return { child, exited, stderr: () => stderr };
}

/** Runs a command in a container and saves what it prints, compressed. The file only appears if the command succeeded. */
export async function execToGzipFile(container: string, command: string[], outFile: string): Promise<void> {
  const partial = `${outFile}.partial`;
  const { child, exited, stderr } = start(["exec", container, ...command]);
  try {
    await pipeline(child.stdout, createGzip(), fs.createWriteStream(partial));
    const code = await exited;
    if (code !== 0) throw new Error(`The database tool failed: ${lastLine(stderr())}`);
    fs.renameSync(partial, outFile);
  } catch (error) {
    child.kill();
    fs.rmSync(partial, { force: true });
    throw error;
  }
}

/** Feeds a compressed SQL file to a command running in a container. */
export async function execFromGzipFile(container: string, command: string[], inFile: string): Promise<void> {
  const { child, exited, stderr } = start(["exec", "-i", container, ...command]);
  try {
    await pipeline(fs.createReadStream(inFile), createGunzip(), child.stdin);
  } catch (error) {
    // The tool may exit early (and close its input) because of an SQL error; its message is the useful part.
    const code = await exited;
    if (code !== 0) throw new Error(`The database tool failed: ${lastLine(stderr())}`);
    throw error;
  }
  const code = await exited;
  if (code !== 0) throw new Error(`The database tool failed: ${lastLine(stderr())}`);
}

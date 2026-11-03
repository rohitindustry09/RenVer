// Small helpers for the launcher (scripts/launcher.mjs): choosing a free port and recognising a running RenVer.
// Plain JavaScript with no dependencies, because it runs before anything else is set up.
import fs from "node:fs";
import net from "node:net";

const HIGHEST_PORT = 65535;
const DEFAULT_ATTEMPTS = 50;

/** Whether nothing is listening on this port on this address. */
export function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

/** The first free port at or above `preferred`. */
export async function findFreePort(preferred, { isFree = isPortFree, attempts = DEFAULT_ATTEMPTS } = {}) {
  const last = Math.min(preferred + attempts - 1, HIGHEST_PORT);
  for (let port = preferred; port <= last; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`No free port between ${preferred} and ${last}.`);
}

/** What a running RenVer wrote to its lock file: { pid, port }, or null when there is no usable lock. */
export function readLock(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Number.isInteger(parsed?.pid) && Number.isInteger(parsed?.port) ? { pid: parsed.pid, port: parsed.port } : null;
  } catch {
    return null;
  }
}

/** Whether a process with this id exists. A lock left behind by a crash points at a process that is gone. */
export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // "No permission" still means the process exists.
    return error?.code === "EPERM";
  }
}

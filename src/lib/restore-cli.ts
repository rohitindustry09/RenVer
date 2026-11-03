import net from "node:net";
import path from "node:path";
import { isPidAlive, readLock } from "../../scripts/port-select.mjs";
import { pruneRestoreLeftovers, restoreBackup } from "./backup.ts";

/**
 * Usage: npm run restore -- <backup file> [--data-dir <folder>] [--force]
 * Run with RenVer stopped. The database it replaces is kept beside it.
 */
const DEFAULT_PANEL_PORT = 3000;
const PROBE_TIMEOUT_MS = 800;
const LOCK_NAME = ".renver.lock";

function answersOn(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });
}

/** The port a running RenVer is on, or null. The launcher's lock file names it; otherwise the usual port is tried. */
async function runningPanelPort(dataDir: string): Promise<number | null> {
  const lock = readLock(path.join(dataDir, LOCK_NAME));
  if (lock && isPidAlive(lock.pid)) return lock.port;
  const usual = Number(process.env.RENVER_PORT || DEFAULT_PANEL_PORT);
  return (await answersOn(usual)) ? usual : null;
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const dirIndex = args.indexOf("--data-dir");
const dataDir = path.resolve(dirIndex >= 0 ? (args[dirIndex + 1] ?? "") : (process.env.RENVER_DATA_DIR ?? "data"));
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--data-dir");

if (!file) {
  process.stderr.write("Usage: npm run restore -- <backup file> [--data-dir <folder>] [--force]\n");
  process.exit(2);
}

const runningOn = force ? null : await runningPanelPort(dataDir);
if (runningOn !== null) {
  process.stderr.write(`RenVer appears to be running on port ${runningOn}. Stop it first (or pass --force), then try again.\n`);
  process.exit(1);
}

try {
  // An encrypted backup is opened with RENVER_BACKUP_PASSPHRASE (set it for this one command).
  const result = await restoreBackup({ file: path.resolve(file), dataDir, passphrase: process.env.RENVER_BACKUP_PASSPHRASE || undefined });
  pruneRestoreLeftovers(dataDir);
  process.stdout.write(`Restored into ${dataDir}: ${result.restored.join(", ")}\n`);
  if (result.previousDatabase) process.stdout.write(`The previous database was kept as ${result.previousDatabase}\n`);
  if (result.dumps.length > 0) process.stdout.write(`Database data restored from the backup: ${result.dumps.length} file(s).\n`);
  process.stdout.write("Start RenVer again. Everything that was restored starts out PAUSED: resume each app and database when you want it running.\n");
} catch (error) {
  process.stderr.write(`Restore failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

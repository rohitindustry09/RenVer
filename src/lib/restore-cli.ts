import net from "node:net";
import path from "node:path";
import { pruneRestoreLeftovers, restoreBackup } from "./backup.ts";

/**
 * Usage: npm run restore -- <backup file> [--data-dir <folder>] [--force]
 * Run with RenVer stopped. The database it replaces is kept beside it.
 */
const PANEL_PORT = 3000;
const PROBE_TIMEOUT_MS = 800;

function isPanelRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: PANEL_PORT });
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });
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

if (!force && (await isPanelRunning())) {
  process.stderr.write(`RenVer appears to be running on port ${PANEL_PORT}. Stop it first (or pass --force), then try again.\n`);
  process.exit(1);
}

try {
  const result = await restoreBackup({ file: path.resolve(file), dataDir });
  pruneRestoreLeftovers(dataDir);
  process.stdout.write(`Restored into ${dataDir}: ${result.restored.join(", ")}\n`);
  if (result.previousDatabase) process.stdout.write(`The previous database was kept as ${result.previousDatabase}\n`);
  if (result.dumps.length > 0) process.stdout.write(`Database data restored from the backup: ${result.dumps.length} file(s).\n`);
  process.stdout.write("Start RenVer again. Everything that was restored starts out PAUSED: resume each app and database when you want it running.\n");
} catch (error) {
  process.stderr.write(`Restore failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

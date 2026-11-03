// Starts RenVer ("dev" or "start") on a free port.
//
//   node scripts/launcher.mjs start      production build (run `npm run build` first)
//   node scripts/launcher.mjs dev        development with live reload
//
// - The port is RENVER_PORT, or PORT, or 3000. If it is taken, the next free one is used and the app is told which,
//   so the proxy route for the panel follows it.
// - A second RenVer on the same data folder is refused: two panels sharing one database would run every background
//   job twice. A lock file in the data folder records the running one (and is ignored once that process is gone).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "./env-file.mjs";
import { findFreePort, isPidAlive, readLock } from "./port-select.mjs";

const MODES = new Set(["dev", "start"]);
const DEFAULT_PORT = 3000;
const LOCK_NAME = ".renver.lock";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

// The launcher reads .env itself (not Next), so a value means the same thing on every machine: "$" is not expanded,
// Windows line endings and quotes are dropped. Settings already in the environment (systemd, the shell) win.
const SECRET_KEYS = ["RENVER_ADMIN_PASSWORD", "RENVER_ADMIN_USER", "RENVER_TOTP_SECRET", "RENVER_BACKUP_PASSPHRASE"];
try {
  const fromFile = parseEnv(fs.readFileSync(process.env.RENVER_ENV_FILE ? path.resolve(process.env.RENVER_ENV_FILE) : path.join(root, ".env"), "utf8"));
  for (const [key, value] of Object.entries(fromFile)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    } else if (SECRET_KEYS.includes(key) && process.env[key] !== value) {
      // Never print the values, only that two places disagree. This is how an old password in /etc/renver.env hides a new one.
      console.warn(`RenVer: ${key} is also set outside .env (the service file, /etc/renver.env or your shell) and differs from .env. The outside value is used.`);
    }
  }
} catch {
  /* no .env file: fine */
}

// 127.0.0.1 keeps the panel private (Caddy or an SSH tunnel reaches it). RENVER_BIND_HOST=0.0.0.0 lets the server's own IP and port open it.
const HOST = process.env.RENVER_BIND_HOST || "127.0.0.1";

const mode = process.argv[2];
if (!MODES.has(mode)) {
  console.error("Usage: node scripts/launcher.mjs <dev|start>");
  process.exit(2);
}

const dataDir = path.resolve(process.env.RENVER_DATA_DIR ?? "data");
const lockFile = path.join(dataDir, LOCK_NAME);

const running = readLock(lockFile);
if (running && running.pid !== process.pid && isPidAlive(running.pid)) {
  console.error(
    `RenVer is already running with this data folder (process ${running.pid}, http://${HOST}:${running.port}).\n` +
      "Open that address, or stop it first. Starting a second copy would run every background job twice.",
  );
  process.exit(1);
}

const wanted = Number(process.env.RENVER_PORT || process.env.PORT || DEFAULT_PORT);
const preferred = Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : DEFAULT_PORT;
let port;
try {
  port = await findFreePort(preferred);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (port !== preferred) console.log(`RenVer: port ${preferred} is in use, using ${port} instead.`);

fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const writeLock = (pid) => fs.writeFileSync(lockFile, JSON.stringify({ pid, port, at: new Date().toISOString() }), { mode: 0o600 });
// The lock names this launcher, which lives as long as the app does.
writeLock(process.pid);
const removeLock = () => {
  if (readLock(lockFile)?.pid === process.pid) fs.rmSync(lockFile, { force: true });
};

console.log(`RenVer (${mode}) will open at http://${HOST}:${port}`);
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, mode, "-H", HOST, "-p", String(port)], {
  stdio: "inherit",
  // The app reads RENVER_PORT to point the proxy at itself.
  env: { ...process.env, PORT: String(port), RENVER_PORT: String(port) },
});

const stop = (signal) => () => child.kill(signal);
process.on("SIGINT", stop("SIGINT"));
process.on("SIGTERM", stop("SIGTERM"));
process.on("exit", removeLock);
child.on("exit", (code, signal) => {
  removeLock();
  process.exit(code ?? (signal ? 1 : 0));
});

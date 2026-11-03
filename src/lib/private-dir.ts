import fs from "node:fs";

const OWNER_ONLY = 0o700;

/**
 * Creates the folder (and parents) if needed and makes sure only its owner can enter it. Everything inside is then out
 * of reach of other users on the machine, whatever the files' own permissions are. Windows has no such mode, so there
 * it only creates the folder.
 */
export function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: OWNER_ONLY });
  if (process.platform !== "win32") fs.chmodSync(dir, OWNER_ONLY);
}

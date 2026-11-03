/** Persistent storage: folders inside an app's container that keep their files across deploys. Client-safe rules. */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_STORAGE_PATHS = 5;
const SAFE_PATH = /^\/[A-Za-z0-9_.\-]+(\/[A-Za-z0-9_.\-]+)*$/;
/** Folders that belong to the system or to the container itself. */
const FORBIDDEN_ROOTS = ["proc", "sys", "dev", "bin", "sbin", "lib", "lib64", "usr", "etc", "run", "boot"];

/**
 * One folder per line (or an array) becomes a clean list: absolute paths only, no "..", no duplicates, nothing that
 * lives inside a system folder.
 */
export function validateStoragePaths(input: string | string[]): Checked<string[]> {
  const lines = (Array.isArray(input) ? input : input.split(/\r?\n/)).map((l) => l.trim()).filter((l) => l !== "");
  const paths: string[] = [];
  for (const raw of lines) {
    const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
    if (!SAFE_PATH.test(path) || path.split("/").some((part) => part === "." || part === "..")) {
      return { ok: false, error: `"${raw}" is not a folder path. Use something like /data (starts with /, letters, numbers, - _ . only).` };
    }
    const root = path.split("/")[1] ?? "";
    if (FORBIDDEN_ROOTS.includes(root)) return { ok: false, error: `"${raw}" is a system folder. Choose another, like /data.` };
    if (!paths.includes(path)) paths.push(path);
  }
  if (paths.length > MAX_STORAGE_PATHS) return { ok: false, error: `Use at most ${MAX_STORAGE_PATHS} folders.` };
  for (const a of paths) {
    const inside = paths.find((b) => a !== b && a.startsWith(`${b}/`));
    if (inside) return { ok: false, error: `${a} is already inside ${inside}. List only ${inside}.` };
  }
  return { ok: true, value: paths };
}

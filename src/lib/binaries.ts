import fs from "node:fs";
import path from "node:path";

type Env = Record<string, string | undefined>;
type Exists = (file: string) => boolean;

/**
 * Known install folders to try when a tool was installed after the panel started,
 * because a running process never sees PATH changes made by an installer.
 */
export function binaryCandidates(name: string, platform: string, env: Env): string[] {
  if (platform !== "win32") return [];
  const exe = `${name}.exe`;
  const candidates: (string | null)[] = [
    env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", exe) : null,
    env.ProgramFiles && name === "docker"
      ? path.win32.join(env.ProgramFiles, "Docker", "Docker", "resources", "bin", exe)
      : null,
    env.ProgramFiles && name === "git" ? path.win32.join(env.ProgramFiles, "Git", "cmd", exe) : null,
    env.ProgramFiles && name === "caddy" ? path.win32.join(env.ProgramFiles, "Caddy", exe) : null,
  ];
  return candidates.filter((c): c is string => c !== null);
}

function isOnPath(name: string, platform: string, env: Env, exists: Exists): boolean {
  const flavour = platform === "win32" ? path.win32 : path.posix;
  const file = platform === "win32" ? `${name}.exe` : name;
  const pathValue = env.PATH ?? env.Path ?? "";
  return pathValue
    .split(flavour.delimiter)
    .filter(Boolean)
    .some((dir) => exists(flavour.join(dir, file)));
}

type ReadDir = (dir: string) => string[];

function readDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** winget unpacks portable packages (like Caddy) into its own Packages folder and adds that folder to PATH. */
function wingetPackageBinary(name: string, env: Env, exists: Exists, readdir: ReadDir): string | null {
  if (!env.LOCALAPPDATA) return null;
  const packages = path.win32.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
  for (const entry of readdir(packages)) {
    const file = path.win32.join(packages, entry, `${name}.exe`);
    if (exists(file)) return file;
  }
  return null;
}

/**
 * Returns the bare name when it is on PATH (so the user's own install wins), otherwise the first
 * known install location that exists, otherwise the bare name so the caller gets a clear ENOENT.
 */
export function resolveBinary(
  name: string,
  env: Env = process.env,
  platform: string = process.platform,
  exists: Exists = fs.existsSync,
  readdir: ReadDir = readDirSafe,
): string {
  if (isOnPath(name, platform, env, exists)) return name;
  const known = binaryCandidates(name, platform, env).find(exists);
  if (known) return known;
  return (platform === "win32" ? wingetPackageBinary(name, env, exists, readdir) : null) ?? name;
}

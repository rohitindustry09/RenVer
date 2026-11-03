import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";

export interface ExtractLimits {
  maxBytes: number;
  maxFiles: number;
}

export interface ExtractResult {
  root: string;
  fileCount: number;
}

const DEFAULT_LIMITS: ExtractLimits = { maxBytes: 500 * 1024 * 1024, maxFiles: 20_000 };
const SKIPPED_SEGMENTS = new Set(["node_modules", ".git", "__MACOSX", ".DS_Store"]);

const MODE_TYPE_MASK = 0o170000;
const MODE_SYMLINK = 0o120000;
const UNIX_MODE_SHIFT = 16;

function isSymlink(entry: AdmZip.IZipEntry): boolean {
  return ((entry.attr >>> UNIX_MODE_SHIFT) & MODE_TYPE_MASK) === MODE_SYMLINK;
}

function normalise(entryName: string): string {
  return entryName.replace(/\\/g, "/");
}

function isSkipped(entryName: string): boolean {
  return normalise(entryName)
    .split("/")
    .some((segment) => SKIPPED_SEGMENTS.has(segment));
}

function safeTarget(destRoot: string, entryName: string): string {
  const name = normalise(entryName);
  if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) {
    throw new Error(`Unsafe path in archive: ${entryName}`);
  }
  const target = path.resolve(destRoot, name);
  const relative = path.relative(destRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path in archive: ${entryName}`);
  }
  return target;
}

function singleTopLevelFolder(destRoot: string): string {
  const entries = fs.readdirSync(destRoot, { withFileTypes: true });
  const only = entries.length === 1 ? entries[0] : undefined;
  return only?.isDirectory() ? path.join(destRoot, only.name) : destRoot;
}

export function extractZip(
  zipPath: string,
  destDir: string,
  limits: ExtractLimits = DEFAULT_LIMITS,
): ExtractResult {
  const entries = new AdmZip(zipPath)
    .getEntries()
    .filter((e) => !isSkipped(e.entryName));
  const files = entries.filter((e) => !e.isDirectory);

  if (files.length > limits.maxFiles) {
    throw new Error(`Archive has too many files (limit ${limits.maxFiles}).`);
  }
  const declaredBytes = files.reduce((sum, e) => sum + e.header.size, 0);
  if (declaredBytes > limits.maxBytes) {
    throw new Error("Archive is too large when extracted.");
  }

  const destRoot = path.resolve(destDir);
  const targets = entries.map((e) => {
    if (isSymlink(e)) throw new Error(`Unsafe path in archive: symlink ${e.entryName}`);
    return { entry: e, target: safeTarget(destRoot, e.entryName) };
  });

  fs.mkdirSync(destRoot, { recursive: true });
  let writtenBytes = 0;
  for (const { entry, target } of targets) {
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    const data = entry.getData();
    writtenBytes += data.length;
    if (writtenBytes > limits.maxBytes) {
      throw new Error("Archive is too large when extracted.");
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }

  return { root: singleTopLevelFolder(destRoot), fileCount: files.length };
}

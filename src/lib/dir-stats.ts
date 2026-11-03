import fs from "node:fs";
import path from "node:path";

export interface DirStats {
  files: number;
  bytes: number;
}

export interface DirLimits {
  maxFiles?: number;
  maxBytes?: number;
}

/**
 * Counts files and bytes without following symlinks, and stops as soon as a limit is passed
 * so a huge or hostile folder cannot make the walk itself expensive.
 */
export function directoryStats(root: string, limits: DirLimits = {}): DirStats {
  const maxFiles = limits.maxFiles ?? Number.POSITIVE_INFINITY;
  const maxBytes = limits.maxBytes ?? Number.POSITIVE_INFINITY;
  const stats: DirStats = { files: 0, bytes: 0 };
  const pending = [root];

  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        pending.push(full);
        continue;
      }
      stats.files += 1;
      stats.bytes += fs.lstatSync(full).size;
      if (stats.files > maxFiles || stats.bytes > maxBytes) return stats;
    }
  }
  return stats;
}

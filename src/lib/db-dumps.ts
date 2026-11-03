import fs from "node:fs";
import path from "node:path";

/** Backups of what is inside a database container, as gzipped SQL: `<database>-<UTC time>-<manual|auto>.sql.gz`. */

export type DumpKind = "manual" | "auto";

export interface DumpInfo {
  name: string;
  bytes: number;
  createdAt: Date;
  kind: DumpKind;
}

const DUMPS_DIR = "db-dumps";
const NAME_PATTERN = /^([a-z0-9][a-z0-9-]*)-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-(manual|auto)\.sql\.gz$/;
export const KEEP_AUTO_DUMPS = 7;

export const dumpDirFor = (dataDir: string): string => path.join(dataDir, DUMPS_DIR);

export function dumpFileName(database: string, date: Date, kind: DumpKind): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${database}-${stamp}-${kind}.sql.gz`;
}

export function parseDumpName(name: string): { database: string; createdAt: Date; kind: DumpKind } | null {
  const m = NAME_PATTERN.exec(name);
  if (!m) return null;
  const [, database, y, mo, d, h, mi, s, kind] = m;
  return { database: database!, createdAt: new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!)), kind: kind as DumpKind };
}

/** Resolves a file name to its path, refusing anything that is not exactly one of this database's dump names. */
export function dumpPath(dataDir: string, database: string, name: string): string {
  if (parseDumpName(name)?.database !== database) throw new Error("Invalid dump name.");
  return path.join(dumpDirFor(dataDir), name);
}

/** The newest first. */
export function listDumps(dataDir: string, database: string): DumpInfo[] {
  const dir = dumpDirFor(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .flatMap((name) => {
      const parsed = parseDumpName(name);
      if (!parsed || parsed.database !== database) return [];
      return [{ name, bytes: fs.statSync(path.join(dir, name)).size, createdAt: parsed.createdAt, kind: parsed.kind }];
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function deleteDump(dataDir: string, database: string, name: string): void {
  const file = dumpPath(dataDir, database, name);
  if (!fs.existsSync(file)) throw new Error("Backup not found.");
  fs.rmSync(file);
}

/** Deletes automatic dumps beyond the newest few. Manual dumps are never pruned. */
export function pruneDumps(dataDir: string, database: string, keepAuto: number = KEEP_AUTO_DUMPS): number {
  const stale = listDumps(dataDir, database).filter((d) => d.kind === "auto").slice(keepAuto);
  for (const dump of stale) fs.rmSync(dumpPath(dataDir, database, dump.name), { force: true });
  return stale.length;
}

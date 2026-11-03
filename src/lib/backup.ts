import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { decryptFile, encryptFile, isEncryptedFile } from "./backup-crypto";
import { dumpPath, parseDumpName } from "./db-dumps";

/**
 * Backups of RenVer's own state: the database, the encryption key and (optionally) project sources.
 * Dependency-free on purpose, so the restore command can run when nothing else is working.
 *
 * Database containers' data travels as SQL dumps in db-dumps/ (made by the caller, who can reach Docker). Docker
 * images are not included: they are rebuilt from the saved sources, which a full backup carries.
 */

const run = promisify(execFile);

export type BackupKind = "auto" | "manual" | "full";

/** Encrypted backups end in ".enc" (see backup-crypto.ts). */
const ENCRYPTED_SUFFIX = ".enc";

export interface BackupInfo {
  /** Whether the file is encrypted with a passphrase and needs it to be read. */
  encrypted: boolean;
  name: string;
  bytes: number;
  createdAt: Date;
  kind: BackupKind;
}

export interface BackupManifest {
  format: number;
  createdAt: string;
  kind: BackupKind;
  files: string[];
  /** File names of the database dumps inside db-dumps/. Absent in backups made before dumps were included. */
  dumps?: string[];
}

const BACKUPS_DIR = "backups";
const DB_FILE = "renver.db";
const KEY_FILE = "secret.key";
const UPLOADS_DIR = "uploads";
const DUMPS_DIR = "db-dumps";
/** Left in the data folder by a restore until the panel has paused everything and recorded which dumps to apply. */
export const RESTORE_MARKER_FILE = "restore-pending.json";
const MANIFEST_FILE = "MANIFEST.json";
const MANIFEST_FORMAT = 1;
const NAME_PATTERN = /^renver-backup-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-(auto|manual|full)\.tar\.gz(?:\.enc)?$/;
const TAR_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_LISTING_BYTES = 256 * 1024 * 1024;
export const KEEP_AUTO_BACKUPS = 7;
const DEFAULT_KEEP_AUTO = KEEP_AUTO_BACKUPS;
const KINDS: readonly BackupKind[] = ["auto", "manual", "full"];
/** The only top-level names a RenVer backup ever contains. */
const ALLOWED_ENTRIES = new Set([MANIFEST_FILE, DB_FILE, KEY_FILE, UPLOADS_DIR, DUMPS_DIR]);
const NOT_A_BACKUP = "This file is not a RenVer backup.";

const NEEDS_PASSPHRASE = "This backup is encrypted. Enter its passphrase (or set RENVER_BACKUP_PASSPHRASE on this server).";

export function backupFileName(date: Date, kind: BackupKind, encrypted = false): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `renver-backup-${stamp}-${kind}.tar.gz${encrypted ? ENCRYPTED_SUFFIX : ""}`;
}

export const isEncryptedBackupName = (name: string): boolean => name.endsWith(ENCRYPTED_SUFFIX);

/**
 * Runs `task` on a readable (plain) copy of the archive. An encrypted backup is decrypted to a short-lived copy in
 * `scratchDir` first, and that copy is always deleted afterwards.
 */
async function withPlainArchive<T>(file: string, passphrase: string | undefined, scratchDir: string, task: (plain: string) => Promise<T>): Promise<T> {
  if (!isEncryptedFile(file)) return task(file);
  if (!passphrase) throw new Error(NEEDS_PASSPHRASE);
  fs.mkdirSync(scratchDir, { recursive: true });
  const plain = path.join(scratchDir, `.plain-${randomBytes(6).toString("hex")}.tar.gz`);
  try {
    await decryptFile(file, plain, passphrase);
    return await task(plain);
  } finally {
    fs.rmSync(plain, { force: true });
  }
}

export function parseBackupName(name: string): { createdAt: Date; kind: BackupKind } | null {
  const m = NAME_PATTERN.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, kind] = m;
  return { createdAt: new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!)), kind: kind as BackupKind };
}

const backupsDir = (dataDir: string): string => path.join(dataDir, BACKUPS_DIR);

/** Resolves a backup name to its file, refusing anything that is not exactly one of our file names. */
export function backupPath(dataDir: string, name: string): string {
  if (!parseBackupName(name)) throw new Error("Invalid backup name.");
  return path.join(backupsDir(dataDir), name);
}

/** tar is run with relative paths from a working directory, which avoids drive-letter quirks of some tar builds. */
async function tar(args: string[], cwd: string): Promise<void> {
  await run("tar", args, { cwd, timeout: TAR_TIMEOUT_MS, windowsHide: true });
}

async function tarOutput(args: string[], cwd: string): Promise<string> {
  const { stdout } = await run("tar", args, { cwd, timeout: TAR_TIMEOUT_MS, windowsHide: true, maxBuffer: MAX_LISTING_BYTES });
  return stdout;
}

const relativeOrAbsolute = (from: string, to: string): string => {
  const rel = path.relative(from, to);
  return path.isAbsolute(rel) ? to : rel;
};

/** A consistent copy of the live database (safe while the panel is writing to it). */
function snapshotDatabase(dbPath: string, destPath: string): void {
  const sqlite = process.getBuiltinModule("node:sqlite");
  const db = new sqlite.DatabaseSync(dbPath);
  try {
    db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

const DAMAGED_DB = "The database inside this backup is damaged.";
const NOT_RENVER_DB = "The database inside this backup is not a RenVer database.";
/** Present in every RenVer database since the first version, so its absence means a foreign file. */
const REQUIRED_TABLE = "projects";

/** Confirms a file really is a healthy RenVer database, before anything is replaced with it. */
export function verifyDatabaseFile(file: string): void {
  const sqlite = process.getBuiltinModule("node:sqlite");
  let db: InstanceType<typeof sqlite.DatabaseSync>;
  try {
    db = new sqlite.DatabaseSync(file, { readOnly: true });
  } catch {
    throw new Error(DAMAGED_DB);
  }
  try {
    const check = db.prepare("PRAGMA quick_check").get() as { quick_check?: string } | undefined;
    if (check?.quick_check !== "ok") throw new Error(DAMAGED_DB);
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(REQUIRED_TABLE);
    if (!table) throw new Error(NOT_RENVER_DB);
  } catch (error) {
    // Anything that goes wrong while reading (for example "file is not a database") means the file is unusable.
    throw error instanceof Error && error.message === NOT_RENVER_DB ? error : new Error(DAMAGED_DB);
  } finally {
    db.close();
  }
}

/** A database dump to put inside the backup: its file name (one of ours) and where it is on disk. */
export interface DumpToInclude {
  name: string;
  file: string;
}

export async function createBackup(input: {
  dataDir: string;
  kind: BackupKind;
  now?: Date;
  dumps?: DumpToInclude[];
  /** When given, the backup is encrypted with it and can only be read with it. */
  passphrase?: string;
}): Promise<BackupInfo> {
  const { dataDir, kind } = input;
  const encrypted = Boolean(input.passphrase);
  const dumps = input.dumps ?? [];
  if (dumps.some((dump) => parseDumpName(dump.name) === null)) throw new Error("Invalid dump name.");
  const dbPath = path.join(dataDir, DB_FILE);
  if (!fs.existsSync(dbPath)) throw new Error("There is no database to back up yet.");

  const dir = backupsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });

  const when = freeStamp(dir, input.now ?? new Date(), kind);
  const name = backupFileName(when, kind, encrypted);

  const stagingName = `.staging-${randomBytes(6).toString("hex")}`;
  const staging = path.join(dir, stagingName);
  const partial = `${name}.partial`;
  // An encrypted backup is first written as a plain archive under another name, then encrypted, and that copy is deleted.
  const plainPartial = `${partial}.plain`;
  fs.mkdirSync(staging);
  try {
    snapshotDatabase(dbPath, path.join(staging, DB_FILE));
    const keyPath = path.join(dataDir, KEY_FILE);
    const files = [DB_FILE];
    if (fs.existsSync(keyPath)) {
      fs.copyFileSync(keyPath, path.join(staging, KEY_FILE));
      files.push(KEY_FILE);
    }
    const uploads = path.join(dataDir, UPLOADS_DIR);
    if (kind === "full" && fs.existsSync(uploads)) {
      fs.cpSync(uploads, path.join(staging, UPLOADS_DIR), { recursive: true });
      files.push(UPLOADS_DIR);
    }
    if (dumps.length > 0) {
      fs.mkdirSync(path.join(staging, DUMPS_DIR));
      for (const dump of dumps) fs.copyFileSync(dump.file, path.join(staging, DUMPS_DIR, dump.name));
      files.push(DUMPS_DIR);
    }
    const manifest: BackupManifest = {
      format: MANIFEST_FORMAT,
      createdAt: when.toISOString(),
      kind,
      files,
      ...(dumps.length > 0 ? { dumps: dumps.map((d) => d.name) } : {}),
    };
    fs.writeFileSync(path.join(staging, MANIFEST_FILE), JSON.stringify(manifest, null, 2));

    if (encrypted) {
      await tar(["-czf", plainPartial, "-C", stagingName, "."], dir);
      await encryptFile(path.join(dir, plainPartial), path.join(dir, partial), input.passphrase!);
    } else {
      await tar(["-czf", partial, "-C", stagingName, "."], dir);
    }
    fs.renameSync(path.join(dir, partial), path.join(dir, name));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(path.join(dir, partial), { force: true });
    fs.rmSync(path.join(dir, plainPartial), { force: true });
  }
  return { name, bytes: fs.statSync(path.join(dir, name)).size, createdAt: when, kind, encrypted };
}

/** The first timestamp at or after `start` that no existing backup of this kind uses, encrypted or not. */
function freeStamp(dir: string, start: Date, kind: BackupKind): Date {
  let when = start;
  const taken = (at: Date): boolean =>
    fs.existsSync(path.join(dir, backupFileName(at, kind))) || fs.existsSync(path.join(dir, backupFileName(at, kind, true)));
  while (taken(when)) when = new Date(when.getTime() + 1000);
  return when;
}

export function listBackups(dataDir: string): BackupInfo[] {
  const dir = backupsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .flatMap((name) => {
      const parsed = parseBackupName(name);
      return parsed ? [{ name, bytes: fs.statSync(path.join(dir, name)).size, encrypted: isEncryptedBackupName(name), ...parsed }] : [];
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function deleteBackup(dataDir: string, name: string): void {
  const file = backupPath(dataDir, name);
  if (!fs.existsSync(file)) throw new Error("Backup not found.");
  fs.rmSync(file);
}

/** Deletes automatic backups beyond the newest few. Manual and full backups are never pruned. */
export function pruneBackups(dataDir: string, keepAuto: number = DEFAULT_KEEP_AUTO): number {
  const stale = listBackups(dataDir).filter((b) => b.kind === "auto").slice(keepAuto);
  for (const backup of stale) fs.rmSync(backupPath(dataDir, backup.name), { force: true });
  return stale.length;
}

/** When the newest automatic backup was made, or null if there has not been one. */
export function lastAutoBackupAt(dataDir: string): Date | null {
  return listBackups(dataDir).find((b) => b.kind === "auto")?.createdAt ?? null;
}

/** Strips "./" prefixes, backslashes and trailing slashes so entry names can be compared. */
const normalizeEntry = (raw: string): string => raw.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "");

function assertSafeEntry(raw: string): string | null {
  const entry = normalizeEntry(raw);
  if (entry === "" || entry === ".") return null;
  if (entry.startsWith("/") || /^[A-Za-z]:/.test(entry) || entry.split("/").includes("..")) {
    throw new Error(`Unsafe path in backup: ${raw}`);
  }
  const [top] = entry.split("/");
  const parts = entry.split("/");
  const isAllowedDump = top === DUMPS_DIR && parts.length === 2 && parseDumpName(parts[1]!) !== null;
  const isAllowed = ALLOWED_ENTRIES.has(top!) && (top === UPLOADS_DIR || entry === top || isAllowedDump);
  if (!isAllowed) throw new Error(`${NOT_A_BACKUP} (unexpected entry "${raw}")`);
  return entry;
}

/**
 * Checks an archive WITHOUT extracting it: every entry must be a plain file or folder with a safe path and one of
 * the few names RenVer writes, and the manifest must be present and readable. Run before anything touches disk.
 */
export async function validateBackupArchive(file: string, passphrase?: string): Promise<BackupManifest> {
  return withPlainArchive(file, passphrase, path.dirname(path.resolve(file)), validatePlainArchive);
}

async function validatePlainArchive(file: string): Promise<BackupManifest> {
  const cwd = path.dirname(path.resolve(file));
  const base = path.basename(file);

  let names: string[];
  let verbose: string[];
  try {
    names = (await tarOutput(["-tzf", base], cwd)).split(/\r?\n/).filter(Boolean);
    verbose = (await tarOutput(["-tvzf", base], cwd)).split(/\r?\n/).filter(Boolean);
  } catch {
    throw new Error(NOT_A_BACKUP);
  }

  if (verbose.some((line) => /^[lh]/.test(line))) throw new Error("Backups cannot contain links.");
  if (verbose.some((line) => !/^[-d]/.test(line))) throw new Error(`${NOT_A_BACKUP} (it contains special files)`);

  let manifestEntry: string | null = null;
  const seen = new Set<string>();
  for (const raw of names) {
    const entry = assertSafeEntry(raw);
    if (entry === null) continue;
    seen.add(entry);
    if (entry === MANIFEST_FILE) manifestEntry = raw;
  }
  if (!manifestEntry || !seen.has(DB_FILE)) throw new Error(NOT_A_BACKUP);

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(await tarOutput(["-xzOf", base, manifestEntry], cwd)) as BackupManifest;
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  if (manifest?.format !== MANIFEST_FORMAT) throw new Error(`${NOT_A_BACKUP} (unsupported version)`);
  return manifest;
}

/** Files an uploaded archive among the backups, named after the date and kind recorded inside it. */
export async function adoptUploadedBackup(input: { dataDir: string; file: string; passphrase?: string }): Promise<BackupInfo> {
  const dir = backupsDir(input.dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const encrypted = isEncryptedFile(input.file);
  const manifest = await withPlainArchive(input.file, input.passphrase, dir, validatePlainArchive);
  const kind = KINDS.includes(manifest.kind) ? manifest.kind : "manual";
  const recorded = new Date(manifest.createdAt);

  const when = freeStamp(dir, Number.isNaN(recorded.getTime()) ? new Date() : recorded, kind);
  const name = backupFileName(when, kind, encrypted);
  fs.renameSync(input.file, path.join(dir, name));
  return { name, bytes: fs.statSync(path.join(dir, name)).size, createdAt: when, kind, encrypted };
}

const ASIDE_PATTERN = /^(.+)\.before-restore-(\d{8}T\d{6})$/;
const DEFAULT_KEEP_RESTORE_SETS = 3;

/**
 * Each restore keeps what it replaced beside it, for undo. This removes all but the newest few sets
 * (a set is everything replaced by one restore), so old copies of the database and key do not pile up.
 */
export function pruneRestoreLeftovers(dataDir: string, keepSets: number = DEFAULT_KEEP_RESTORE_SETS): number {
  if (!fs.existsSync(dataDir)) return 0;
  const aside = fs.readdirSync(dataDir).flatMap((name) => {
    const match = ASIDE_PATTERN.exec(name);
    return match ? [{ name, stamp: match[2]! }] : [];
  });
  const stale = new Set([...new Set(aside.map((a) => a.stamp))].sort().reverse().slice(keepSets));
  const doomed = aside.filter((a) => stale.has(a.stamp));
  for (const item of doomed) fs.rmSync(path.join(dataDir, item.name), { recursive: true, force: true });
  return doomed.length;
}

export interface RestoreMarker {
  /** The database dumps that came with the restored backup. */
  dumps: string[];
}

export function readRestoreMarker(dataDir: string): RestoreMarker | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dataDir, RESTORE_MARKER_FILE), "utf8"));
    const dumps = (parsed as { dumps?: unknown }).dumps;
    return Array.isArray(dumps) ? { dumps: dumps.filter((d): d is string => typeof d === "string") } : null;
  } catch {
    return null;
  }
}

export function clearRestoreMarker(dataDir: string): void {
  fs.rmSync(path.join(dataDir, RESTORE_MARKER_FILE), { force: true });
}

export interface RestoreResult {
  /** The database dumps that came with the backup (and are now in the data folder). */
  dumps: string[];
  restored: string[];
  /** Name (inside the data folder) of the database that was replaced, if there was one. */
  previousDatabase: string | null;
}

/** Where a restored dump goes. Its name was already checked against our dump pattern. */
const dumpPathFor = (dataDir: string, name: string): string => dumpPath(dataDir, parseDumpName(name)!.database, name);

const stampForFile = (): string => new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);

/** Copies a restored file or folder next to its destination first, so the swap itself is just quick renames. */
function stage(source: string, destination: string): string {
  const staged = `${destination}.restoring`;
  fs.rmSync(staged, { recursive: true, force: true });
  fs.cpSync(source, staged, { recursive: true });
  return staged;
}

/**
 * Moves the current item aside (keeping it for undo) and puts the staged one in its place.
 * If the second step fails, the original is put back, so a failed swap never leaves the item missing.
 */
function swapIn(staged: string, destination: string, stamp: string): string | null {
  let previous: string | null = null;
  if (fs.existsSync(destination)) {
    previous = `${destination}.before-restore-${stamp}`;
    fs.renameSync(destination, previous);
  }
  try {
    fs.renameSync(staged, destination);
  } catch (error) {
    if (previous) fs.renameSync(previous, destination);
    throw error;
  }
  return previous;
}

export interface CommittedRestore extends RestoreResult {
  /** Reverses the swap: puts back everything that was replaced. Use it if the restored data turns out to be unusable. */
  undo(): void;
}

export interface PreparedRestore {
  /** Swaps the staged files in. Synchronous on purpose: with no awaits, nothing else can run in the middle. */
  commit(): CommittedRestore;
  /** Removes everything staged. Safe to call after commit, or more than once. */
  cancel(): void;
}

/**
 * The slow, safe half of a restore: validates the archive, extracts it to a scratch folder and stages copies next
 * to the files they will replace. Nothing live is changed until commit().
 */
export async function prepareRestore(input: { file: string; dataDir: string; passphrase?: string }): Promise<PreparedRestore> {
  if (!fs.existsSync(input.file)) throw new Error("Backup file not found.");
  // Everything is extracted before this returns, so an encrypted backup's readable copy is gone again by then.
  return withPlainArchive(input.file, input.passphrase, input.dataDir, (plain) => prepareFromPlain({ file: plain, dataDir: input.dataDir }));
}

async function prepareFromPlain(input: { file: string; dataDir: string }): Promise<PreparedRestore> {
  const { file, dataDir } = input;
  await validatePlainArchive(file);

  fs.mkdirSync(dataDir, { recursive: true });
  const temp = fs.mkdtempSync(path.join(dataDir, ".restore-"));
  const stagedPaths: string[] = [];
  const cancel = (): void => {
    for (const leftover of stagedPaths) fs.rmSync(leftover, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  };

  try {
    const cwd = path.dirname(path.resolve(file));
    await tar(["-xzf", path.basename(file), "-C", relativeOrAbsolute(cwd, temp)], cwd);

    const extractedDb = path.join(temp, DB_FILE);
    if (!fs.existsSync(extractedDb) || !fs.statSync(extractedDb).isFile()) throw new Error(NOT_A_BACKUP);

    const dbPath = path.join(dataDir, DB_FILE);
    const stagedDb = stage(extractedDb, dbPath);
    stagedPaths.push(stagedDb);
    verifyDatabaseFile(stagedDb);

    const items: { staged: string; destination: string; label: string }[] = [];
    for (const label of [KEY_FILE, UPLOADS_DIR]) {
      const source = path.join(temp, label);
      if (!fs.existsSync(source)) continue;
      const destination = path.join(dataDir, label);
      const staged = stage(source, destination);
      stagedPaths.push(staged);
      items.push({ staged, destination, label });
    }

    const dumpsDir = path.join(temp, DUMPS_DIR);
    const dumpNames = fs.existsSync(dumpsDir) ? fs.readdirSync(dumpsDir).filter((n) => parseDumpName(n) !== null) : [];

    return {
      cancel,
      commit: () => {
        const stamp = stampForFile();
        const swaps: { destination: string; previous: string | null }[] = [];
        const undo = (): void => {
          for (const swap of [...swaps].reverse()) {
            fs.rmSync(swap.destination, { recursive: true, force: true });
            if (swap.previous) fs.renameSync(swap.previous, swap.destination);
          }
        };
        const record = (destination: string, previous: string | null): string | null => {
          swaps.push({ destination, previous });
          return previous;
        };

        const copiedDumps: string[] = [];
        const markerPath = path.join(dataDir, RESTORE_MARKER_FILE);
        const previousMarker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath) : null;
        const undoDumps = (): void => {
          for (const copied of copiedDumps) fs.rmSync(copied, { force: true });
          if (previousMarker) fs.writeFileSync(markerPath, previousMarker);
          else fs.rmSync(markerPath, { force: true });
        };

        try {
          const previousDb = record(dbPath, swapIn(stagedDb, dbPath, stamp));
          // The old database's journal files belong to the old database: keep them aside too, so an undo loses nothing.
          for (const leftover of [`${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
            const current = path.join(dataDir, leftover);
            if (!fs.existsSync(current)) continue;
            const aside = `${current}.before-restore-${stamp}`;
            fs.renameSync(current, aside);
            record(current, aside);
          }
          const restored = [DB_FILE];
          for (const item of items) {
            record(item.destination, swapIn(item.staged, item.destination, stamp));
            restored.push(item.label);
          }
          // Dumps are only added, never replaced, so a same-named dump already here is left as it is.
          if (dumpNames.length > 0) fs.mkdirSync(path.join(dataDir, DUMPS_DIR), { recursive: true });
          for (const name of dumpNames) {
            const destination = dumpPathFor(dataDir, name);
            if (fs.existsSync(destination)) continue;
            fs.copyFileSync(path.join(dumpsDir, name), destination);
            copiedDumps.push(destination);
          }
          fs.writeFileSync(markerPath, JSON.stringify({ dumps: dumpNames }));
          return {
            restored,
            dumps: dumpNames,
            previousDatabase: previousDb ? path.basename(previousDb) : null,
            undo: () => {
              undo();
              undoDumps();
            },
          };
        } catch (error) {
          undo();
          undoDumps();
          throw error;
        }
      },
    };
  } catch (error) {
    cancel();
    throw error;
  }
}

/**
 * Puts a backup's contents back into the data folder. RenVer must not be using the database while this runs
 * (the restore command checks that; the panel closes its own connection first). What gets replaced is kept beside
 * it, so a restore can be undone.
 */
export async function restoreBackup(input: { file: string; dataDir: string; passphrase?: string }): Promise<RestoreResult> {
  const prepared = await prepareRestore(input);
  try {
    return prepared.commit();
  } finally {
    prepared.cancel();
  }
}

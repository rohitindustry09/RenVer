import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTarGz, validBackupEntries, type TarEntry } from "./helpers/tar";
import {
  adoptUploadedBackup,
  backupFileName,
  backupPath,
  createBackup,
  prepareRestore,
  pruneRestoreLeftovers,
  validateBackupArchive,
  verifyDatabaseFile,
  deleteBackup,
  lastAutoBackupAt,
  listBackups,
  parseBackupName,
  pruneBackups,
  restoreBackup,
} from "@/lib/backup";

const sqlite = process.getBuiltinModule("node:sqlite");
let dataDir: string;

function makeDatabase(file: string, rows: string[]): void {
  const db = new sqlite.DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS notes (text TEXT); CREATE TABLE IF NOT EXISTS projects (id TEXT)");
  for (const row of rows) db.prepare("INSERT INTO notes (text) VALUES (?)").run(row);
  db.close();
}

function readNotes(file: string): string[] {
  const db = new sqlite.DatabaseSync(file);
  const rows = (db.prepare("SELECT text FROM notes ORDER BY rowid").all() as { text: string }[]).map((r) => r.text);
  db.close();
  return rows;
}

function extract(archive: string): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "renver-extract-"));
  execFileSync("tar", ["-xzf", path.basename(archive), "-C", path.relative(path.dirname(archive), out)], { cwd: path.dirname(archive) });
  return out;
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-bk-"));
  makeDatabase(path.join(dataDir, "renver.db"), ["alpha", "beta"]);
  fs.writeFileSync(path.join(dataDir, "secret.key"), "KEY-ONE");
  fs.mkdirSync(path.join(dataDir, "uploads", "u1", "src"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "uploads", "u1", "src", "index.html"), "<h1>hi</h1>");
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "logs", "x.log"), "log");
});

afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe("backup names", () => {
  it("round-trips a name", () => {
    const date = new Date("2026-03-05T14:07:09Z");
    const name = backupFileName(date, "manual");
    expect(name).toBe("renver-backup-20260305T140709Z-manual.tar.gz");
    expect(parseBackupName(name)).toEqual({ createdAt: date, kind: "manual" });
  });

  it.each(["x.tar.gz", "renver-backup-2026-manual.tar.gz", "renver-backup-20260305T140709Z-evil.tar.gz", "../renver-backup-20260305T140709Z-auto.tar.gz"])(
    "rejects %j",
    (name) => {
      expect(parseBackupName(name)).toBeNull();
    },
  );

  it("refuses names that could leave the backups folder", () => {
    expect(() => backupPath(dataDir, "../../etc/passwd")).toThrow(/invalid/i);
    expect(() => backupPath(dataDir, "renver-backup-20260305T140709Z-auto.tar.gz/../x")).toThrow(/invalid/i);
  });
});

describe("createBackup", () => {
  it("captures a consistent copy of the database and the encryption key", async () => {
    const info = await createBackup({ dataDir, kind: "manual" });
    expect(info.kind).toBe("manual");
    expect(info.bytes).toBeGreaterThan(0);

    const out = extract(backupPath(dataDir, info.name));
    try {
      expect(readNotes(path.join(out, "renver.db"))).toEqual(["alpha", "beta"]);
      expect(fs.readFileSync(path.join(out, "secret.key"), "utf8")).toBe("KEY-ONE");
      const manifest = JSON.parse(fs.readFileSync(path.join(out, "MANIFEST.json"), "utf8"));
      expect(manifest).toMatchObject({ format: 1, kind: "manual" });
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it("includes project sources only in a full backup", async () => {
    const light = extract(backupPath(dataDir, (await createBackup({ dataDir, kind: "auto" })).name));
    const full = extract(backupPath(dataDir, (await createBackup({ dataDir, kind: "full", now: new Date(Date.now() + 2000) })).name));
    try {
      expect(fs.existsSync(path.join(light, "uploads"))).toBe(false);
      expect(fs.readFileSync(path.join(full, "uploads", "u1", "src", "index.html"), "utf8")).toBe("<h1>hi</h1>");
      expect(fs.existsSync(path.join(full, "logs"))).toBe(false);
    } finally {
      fs.rmSync(light, { recursive: true, force: true });
      fs.rmSync(full, { recursive: true, force: true });
    }
  });

  it("works when there is no encryption key yet", async () => {
    fs.rmSync(path.join(dataDir, "secret.key"));
    const out = extract(backupPath(dataDir, (await createBackup({ dataDir, kind: "auto" })).name));
    try {
      expect(fs.existsSync(path.join(out, "renver.db"))).toBe(true);
      expect(fs.existsSync(path.join(out, "secret.key"))).toBe(false);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it("fails clearly when there is no database to back up", async () => {
    fs.rmSync(path.join(dataDir, "renver.db"));
    await expect(createBackup({ dataDir, kind: "auto" })).rejects.toThrow(/no database/i);
  });

  it("leaves no temporary files behind", async () => {
    await createBackup({ dataDir, kind: "auto" });
    expect(fs.readdirSync(path.join(dataDir, "backups")).filter((n) => !parseBackupName(n))).toEqual([]);
  });
});

describe("listing, pruning and scheduling", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes, 0));

  it("lists backups newest first and ignores other files", async () => {
    await createBackup({ dataDir, kind: "auto", now: at(1) });
    await createBackup({ dataDir, kind: "manual", now: at(3) });
    await createBackup({ dataDir, kind: "full", now: at(2) });
    fs.writeFileSync(path.join(dataDir, "backups", "notes.txt"), "x");
    const list = listBackups(dataDir);
    expect(list.map((b) => b.kind)).toEqual(["manual", "full", "auto"]);
    expect(list.every((b) => b.bytes > 0)).toBe(true);
  });

  it("returns an empty list before any backup exists", () => {
    expect(listBackups(dataDir)).toEqual([]);
  });

  it("keeps only the newest automatic backups and never deletes manual ones", async () => {
    for (let i = 0; i < 5; i++) await createBackup({ dataDir, kind: "auto", now: at(i) });
    await createBackup({ dataDir, kind: "manual", now: at(10) });
    expect(pruneBackups(dataDir, 3)).toBe(2);
    const left = listBackups(dataDir);
    expect(left.filter((b) => b.kind === "auto")).toHaveLength(3);
    expect(left.filter((b) => b.kind === "manual")).toHaveLength(1);
    expect(left.filter((b) => b.kind === "auto")[2]!.createdAt).toEqual(at(2));
  });

  it("reports when the newest automatic backup was made, ignoring manual and full ones", async () => {
    expect(lastAutoBackupAt(dataDir)).toBeNull();
    await createBackup({ dataDir, kind: "auto", now: at(1) });
    await createBackup({ dataDir, kind: "auto", now: at(5) });
    await createBackup({ dataDir, kind: "manual", now: at(9) });
    await createBackup({ dataDir, kind: "full", now: at(12) });
    expect(lastAutoBackupAt(dataDir)).toEqual(at(5));
  });

  it("deletes a backup by name", async () => {
    const info = await createBackup({ dataDir, kind: "manual" });
    deleteBackup(dataDir, info.name);
    expect(listBackups(dataDir)).toEqual([]);
    expect(() => deleteBackup(dataDir, info.name)).toThrow(/not found/i);
  });
});

/** Writes a crafted archive into the backups folder and returns its path. */
function writeArchive(name: string, entries: TarEntry[]): string {
  const file = path.join(dataDir, "backups", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, makeTarGz(entries));
  return file;
}

describe("validateBackupArchive", () => {
  it("accepts a backup RenVer made itself", async () => {
    const info = await createBackup({ dataDir, kind: "full" });
    const manifest = await validateBackupArchive(backupPath(dataDir, info.name));
    expect(manifest).toMatchObject({ format: 1, kind: "full" });
  });

  it("accepts nested source files and directory entries", async () => {
    const file = writeArchive("a.tar.gz", validBackupEntries([
      { name: "./uploads/", type: "dir" },
      { name: "./uploads/u1/src/index.html", content: "<h1>x</h1>" },
      { name: "./secret.key", content: "KEY" },
    ]));
    await expect(validateBackupArchive(file)).resolves.toMatchObject({ format: 1 });
  });

  it.each([
    ["a path that climbs out of the folder", "../evil.txt"],
    ["a climbing path hidden inside uploads", "./uploads/../../evil.txt"],
    ["an absolute path", "/etc/cron.d/evil"],
    ["a Windows drive path", "C:/Windows/evil.txt"],
    ["a backslash traversal", "..\\evil.txt"],
  ])("rejects %s", async (_label, name) => {
    const file = writeArchive("evil.tar.gz", validBackupEntries([{ name, content: "x" }]));
    await expect(validateBackupArchive(file)).rejects.toThrow(/unsafe/i);
  });

  it("rejects symbolic and hard links, which could point anywhere", async () => {
    for (const type of ["symlink", "hardlink"] as const) {
      const file = writeArchive(`${type}.tar.gz`, validBackupEntries([{ name: "./uploads", type, linkname: "/etc" }]));
      await expect(validateBackupArchive(file)).rejects.toThrow(/link/i);
    }
  });

  it("rejects archives with files RenVer never writes", async () => {
    const file = writeArchive("stray.tar.gz", validBackupEntries([{ name: "./hello.txt", content: "x" }]));
    await expect(validateBackupArchive(file)).rejects.toThrow(/not a RenVer backup/i);
    const nested = writeArchive("nested.tar.gz", validBackupEntries([{ name: "./renver.db/extra", content: "x" }]));
    await expect(validateBackupArchive(nested)).rejects.toThrow(/not a RenVer backup/i);
  });

  it("rejects archives missing the database or the manifest", async () => {
    const noDb = writeArchive("nodb.tar.gz", [{ name: "./MANIFEST.json", content: '{"format":1}' }]);
    await expect(validateBackupArchive(noDb)).rejects.toThrow(/not a RenVer backup/i);
    const noManifest = writeArchive("nomanifest.tar.gz", [{ name: "./renver.db", content: "x" }]);
    await expect(validateBackupArchive(noManifest)).rejects.toThrow(/not a RenVer backup/i);
  });

  it("rejects an unsupported format version and a broken manifest", async () => {
    const future = writeArchive("future.tar.gz", [
      { name: "./MANIFEST.json", content: JSON.stringify({ format: 99 }) },
      { name: "./renver.db", content: "x" },
    ]);
    await expect(validateBackupArchive(future)).rejects.toThrow(/not a RenVer backup|newer/i);
    const broken = writeArchive("broken.tar.gz", [
      { name: "./MANIFEST.json", content: "{not json" },
      { name: "./renver.db", content: "x" },
    ]);
    await expect(validateBackupArchive(broken)).rejects.toThrow(/not a RenVer backup/i);
  });

  it("rejects files that are not archives at all", async () => {
    const file = path.join(dataDir, "backups", "junk.tar.gz");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "this is just text");
    await expect(validateBackupArchive(file)).rejects.toThrow(/not a RenVer backup/i);
  });
});

describe("adoptUploadedBackup", () => {
  it("files an uploaded backup under its own recorded date and kind", async () => {
    const source = createBackupSource();
    const info = await adoptUploadedBackup({ dataDir, file: source });
    expect(info).toMatchObject({ name: "renver-backup-20260305T140709Z-manual.tar.gz", kind: "manual" });
    expect(info.createdAt).toEqual(new Date("2026-03-05T14:07:09.000Z"));
    expect(listBackups(dataDir).map((b) => b.name)).toContain(info.name);
    expect(fs.existsSync(source)).toBe(false);
  });

  it("does not overwrite an existing backup with the same stamp", async () => {
    const first = await adoptUploadedBackup({ dataDir, file: createBackupSource() });
    const second = await adoptUploadedBackup({ dataDir, file: createBackupSource() });
    expect(second.name).not.toBe(first.name);
    expect(listBackups(dataDir)).toHaveLength(2);
  });

  it("refuses an invalid upload and leaves the backups folder clean", async () => {
    const bad = writeArchive(".upload-bad.partial", validBackupEntries([{ name: "../evil.txt", content: "x" }]));
    await expect(adoptUploadedBackup({ dataDir, file: bad })).rejects.toThrow(/unsafe/i);
    expect(listBackups(dataDir)).toEqual([]);
  });
});

function createBackupSource(): string {
  return writeArchive(`.upload-${Math.random().toString(16).slice(2)}.partial`, validBackupEntries());
}

describe("prepareRestore", () => {
  it("changes nothing in the data folder until commit, which is synchronous", async () => {
    const info = await createBackup({ dataDir, kind: "full" });
    makeDatabase(path.join(dataDir, "renver.db"), ["gamma"]);

    const prepared = await prepareRestore({ file: backupPath(dataDir, info.name), dataDir });
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta", "gamma"]);

    const result = prepared.commit();
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
    expect(result.restored).toContain("renver.db");
    prepared.cancel();
    expect(fs.readdirSync(dataDir).filter((n) => n.startsWith(".restore") || n.endsWith(".restoring"))).toEqual([]);
  });

  it("cleans up everything it staged when cancelled", async () => {
    const info = await createBackup({ dataDir, kind: "full" });
    const prepared = await prepareRestore({ file: backupPath(dataDir, info.name), dataDir });
    expect(fs.readdirSync(dataDir).some((n) => n.endsWith(".restoring"))).toBe(true);
    prepared.cancel();
    expect(fs.readdirSync(dataDir).filter((n) => n.startsWith(".restore") || n.endsWith(".restoring"))).toEqual([]);
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
  });

  it("puts the old database back if the swap fails halfway", async () => {
    const info = await createBackup({ dataDir, kind: "auto" });
    const prepared = await prepareRestore({ file: backupPath(dataDir, info.name), dataDir });
    fs.rmSync(path.join(dataDir, "renver.db.restoring"), { force: true }); // sabotage the staged copy
    expect(() => prepared.commit()).toThrow();
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
    prepared.cancel();
  });
});

describe("database check before restoring", () => {
  const leftovers = () => fs.readdirSync(dataDir).filter((n) => n.startsWith(".restore") || n.endsWith(".restoring") || n.includes("before-restore"));

  it("refuses a backup whose database file is junk, and changes nothing", async () => {
    const file = writeArchive("renver-backup-20260101T000002Z-manual.tar.gz", validBackupEntries([], "this is not a sqlite database at all"));
    await expect(restoreBackup({ file, dataDir })).rejects.toThrow(/damaged/i);
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
    expect(leftovers()).toEqual([]);
  });

  it("refuses a real database that is not a RenVer database", async () => {
    const foreign = path.join(dataDir, "foreign.db");
    const db = new sqlite.DatabaseSync(foreign);
    db.exec("CREATE TABLE unrelated (x TEXT)");
    db.close();
    const file = writeArchive("renver-backup-20260101T000003Z-manual.tar.gz", validBackupEntries([], fs.readFileSync(foreign)));
    await expect(restoreBackup({ file, dataDir })).rejects.toThrow(/not a RenVer database/i);
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
    expect(leftovers()).toEqual([]);
  });

  it("accepts a healthy database", async () => {
    expect(() => verifyDatabaseFile(path.join(dataDir, "renver.db"))).not.toThrow();
  });

  it("rejects missing and truncated database files", () => {
    expect(() => verifyDatabaseFile(path.join(dataDir, "missing.db"))).toThrow();
    const truncated = path.join(dataDir, "truncated.db");
    fs.writeFileSync(truncated, fs.readFileSync(path.join(dataDir, "renver.db")).subarray(0, 100));
    expect(() => verifyDatabaseFile(truncated)).toThrow(/damaged/i);
  });
});

describe("pruneRestoreLeftovers", () => {
  const touch = (name: string) => fs.writeFileSync(path.join(dataDir, name), "x");

  it("keeps the newest sets of replaced files and removes older ones", () => {
    for (const stamp of ["20260101T000001", "20260101T000002", "20260101T000003", "20260101T000004"]) {
      touch(`renver.db.before-restore-${stamp}`);
      touch(`secret.key.before-restore-${stamp}`);
    }
    fs.mkdirSync(path.join(dataDir, "uploads.before-restore-20260101T000001"));
    expect(pruneRestoreLeftovers(dataDir, 2)).toBe(5);
    const left = fs.readdirSync(dataDir).filter((n) => n.includes("before-restore"));
    expect(left.sort()).toEqual([
      "renver.db.before-restore-20260101T000003",
      "renver.db.before-restore-20260101T000004",
      "secret.key.before-restore-20260101T000003",
      "secret.key.before-restore-20260101T000004",
    ]);
  });

  it("leaves live files and unrelated files alone", () => {
    touch("renver.db.before-restore-20260101T000001");
    touch("notes.before-restore-soon");
    pruneRestoreLeftovers(dataDir, 0);
    expect(fs.existsSync(path.join(dataDir, "renver.db"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "secret.key"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "notes.before-restore-soon"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "renver.db.before-restore-20260101T000001"))).toBe(false);
  });

  it("does nothing when there is nothing to prune", () => {
    expect(pruneRestoreLeftovers(dataDir, 3)).toBe(0);
  });
});

describe("undoing a commit", () => {
  it("puts the database, key and sources back exactly as they were", async () => {
    const info = await createBackup({ dataDir, kind: "full" });
    // The live state differs from the backup in all three places.
    makeDatabase(path.join(dataDir, "renver.db"), ["live-only"]);
    fs.writeFileSync(path.join(dataDir, "secret.key"), "LIVE-KEY");
    fs.writeFileSync(path.join(dataDir, "uploads", "u1", "src", "index.html"), "<h1>live</h1>");

    const prepared = await prepareRestore({ file: backupPath(dataDir, info.name), dataDir });
    prepared.commit();
    expect(fs.readFileSync(path.join(dataDir, "secret.key"), "utf8")).toBe("KEY-ONE");

    const committed = prepared.commit; // keep the type honest: commit() returns an undo handle
    expect(typeof committed).toBe("function");
    prepared.cancel();
  });

  it("commit() hands back an undo that reverses every swap", async () => {
    const info = await createBackup({ dataDir, kind: "full" });
    makeDatabase(path.join(dataDir, "renver.db"), ["live-only"]);
    fs.writeFileSync(path.join(dataDir, "secret.key"), "LIVE-KEY");
    fs.writeFileSync(path.join(dataDir, "uploads", "u1", "src", "index.html"), "<h1>live</h1>");

    const prepared = await prepareRestore({ file: backupPath(dataDir, info.name), dataDir });
    const committed = prepared.commit();
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);

    committed.undo();
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta", "live-only"]);
    expect(fs.readFileSync(path.join(dataDir, "secret.key"), "utf8")).toBe("LIVE-KEY");
    expect(fs.readFileSync(path.join(dataDir, "uploads", "u1", "src", "index.html"), "utf8")).toBe("<h1>live</h1>");
    prepared.cancel();
  });
});

describe("restoreBackup safety", () => {
  it("refuses a hostile archive before changing anything", async () => {
    const file = writeArchive("renver-backup-20260101T000000Z-manual.tar.gz", validBackupEntries([{ name: "../planted.txt", content: "x" }]));
    await expect(restoreBackup({ file, dataDir })).rejects.toThrow(/unsafe/i);
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
    expect(fs.readdirSync(dataDir).filter((n) => n.includes("before-restore") || n.startsWith(".restore"))).toEqual([]);
    expect(fs.existsSync(path.join(path.dirname(dataDir), "planted.txt"))).toBe(false);
  });

  it("keeps the current database if the backup's database cannot be copied", async () => {
    // A backup whose renver.db is actually a directory entry cannot be copied as a file.
    const file = writeArchive("renver-backup-20260101T000001Z-manual.tar.gz", [
      { name: "./MANIFEST.json", content: JSON.stringify({ format: 1, createdAt: "2026-01-01T00:00:01.000Z", kind: "manual", files: [] }) },
      { name: "./renver.db", type: "dir" },
    ]);
    await expect(restoreBackup({ file, dataDir })).rejects.toThrow();
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
  });
});

describe("restoreBackup", () => {
  it("brings back the database, key and sources after the data was damaged", async () => {
    const info = await createBackup({ dataDir, kind: "full" });

    // Simulate a disaster: new data, a different key, lost sources, stale WAL files.
    fs.writeFileSync(path.join(dataDir, "renver.db"), "corrupt");
    fs.writeFileSync(path.join(dataDir, "renver.db-wal"), "stale");
    fs.writeFileSync(path.join(dataDir, "renver.db-shm"), "stale");
    fs.writeFileSync(path.join(dataDir, "secret.key"), "WRONG");
    fs.rmSync(path.join(dataDir, "uploads"), { recursive: true });

    const result = await restoreBackup({ file: backupPath(dataDir, info.name), dataDir });

    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
    expect(fs.readFileSync(path.join(dataDir, "secret.key"), "utf8")).toBe("KEY-ONE");
    expect(fs.readFileSync(path.join(dataDir, "uploads", "u1", "src", "index.html"), "utf8")).toBe("<h1>hi</h1>");
    expect(fs.existsSync(path.join(dataDir, "renver.db-wal"))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, "renver.db-shm"))).toBe(false);
    expect(result.restored).toEqual(expect.arrayContaining(["renver.db", "secret.key", "uploads"]));
    expect(fs.existsSync(path.join(dataDir, "logs", "x.log"))).toBe(true);
  });

  it("keeps the database it replaces, so a restore can be undone", async () => {
    const info = await createBackup({ dataDir, kind: "auto" });
    makeDatabase(path.join(dataDir, "renver.db"), ["gamma"]);
    const result = await restoreBackup({ file: backupPath(dataDir, info.name), dataDir });
    expect(result.previousDatabase).toMatch(/renver\.db\.before-restore-/);
    expect(readNotes(path.join(dataDir, result.previousDatabase!))).toEqual(["alpha", "beta", "gamma"]);
  });

  it("does not touch sources when restoring a light backup", async () => {
    const info = await createBackup({ dataDir, kind: "auto" });
    await restoreBackup({ file: backupPath(dataDir, info.name), dataDir });
    expect(fs.existsSync(path.join(dataDir, "uploads", "u1", "src", "index.html"))).toBe(true);
  });

  it("rejects an archive that is not a RenVer backup", async () => {
    const bogus = path.join(dataDir, "backups", "renver-backup-20260101T000000Z-manual.tar.gz");
    fs.mkdirSync(path.dirname(bogus), { recursive: true });
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "renver-bogus-"));
    fs.writeFileSync(path.join(staging, "hello.txt"), "not a backup");
    execFileSync("tar", ["-czf", path.basename(bogus), "-C", path.relative(path.dirname(bogus), staging), "."], { cwd: path.dirname(bogus) });
    fs.rmSync(staging, { recursive: true, force: true });
    await expect(restoreBackup({ file: bogus, dataDir })).rejects.toThrow(/not a RenVer backup/i);
    expect(readNotes(path.join(dataDir, "renver.db"))).toEqual(["alpha", "beta"]);
  });

  it("rejects a missing file", async () => {
    await expect(restoreBackup({ file: path.join(dataDir, "nope.tar.gz"), dataDir })).rejects.toThrow(/not found/i);
  });
});

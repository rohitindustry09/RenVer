import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTarGz, validBackupEntries } from "./helpers/tar";
import { clearRestoreMarker, createBackup, readRestoreMarker, restoreBackup, validateBackupArchive } from "@/lib/backup";

const sqlite = process.getBuiltinModule("node:sqlite");
let dataDir: string;
let scratch: string;

function makeDatabase(file: string): void {
  const db = new sqlite.DatabaseSync(file);
  db.exec("CREATE TABLE IF NOT EXISTS projects (id TEXT)");
  db.close();
}

const DUMP = "shop-20261102T103005Z-manual.sql.gz";

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-bd-data-"));
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "renver-bd-scratch-"));
  makeDatabase(path.join(dataDir, "renver.db"));
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
});

const dumpFile = (name = DUMP, content = "SELECT 1;") => {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, content);
  return { name, file };
};

const listArchive = (file: string): string[] => execFileSync("tar", ["-tzf", file], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);

describe("backups that carry database data", () => {
  it("includes the given dumps and lists them in the manifest", async () => {
    const info = await createBackup({ dataDir, kind: "manual", dumps: [dumpFile()] });
    const archive = path.join(dataDir, "backups", info.name);
    expect(listArchive(archive).some((e) => e.replace(/^\.\//, "") === `db-dumps/${DUMP}`)).toBe(true);
    const manifest = await validateBackupArchive(archive);
    expect(manifest.dumps).toEqual([DUMP]);
  });

  it("works for every kind of backup", async () => {
    for (const kind of ["auto", "manual", "full"] as const) {
      const info = await createBackup({ dataDir, kind, dumps: [dumpFile()] });
      const manifest = await validateBackupArchive(path.join(dataDir, "backups", info.name));
      expect(manifest.dumps).toEqual([DUMP]);
    }
  });

  it("still makes a backup with no dumps", async () => {
    const info = await createBackup({ dataDir, kind: "manual" });
    const manifest = await validateBackupArchive(path.join(dataDir, "backups", info.name));
    expect(manifest.dumps ?? []).toEqual([]);
  });

  it("refuses a dump whose name is not one of ours", async () => {
    await expect(createBackup({ dataDir, kind: "manual", dumps: [dumpFile("evil.txt")] })).rejects.toThrow(/invalid/i);
  });
});

describe("validating archives with a db-dumps folder", () => {
  const write = (entries: Parameters<typeof makeTarGz>[0]): string => {
    const file = path.join(scratch, "x.tar.gz");
    fs.writeFileSync(file, makeTarGz(entries));
    return file;
  };

  it("accepts correctly named dumps", async () => {
    const file = write([...validBackupEntries(), { name: `db-dumps/${DUMP}`, content: "x" }]);
    await expect(validateBackupArchive(file)).resolves.toBeTruthy();
  });

  it("rejects other names, odd paths and nested folders inside db-dumps", async () => {
    for (const name of ["db-dumps/notes.txt", "db-dumps/../renver.db", `db-dumps/sub/${DUMP}`]) {
      const file = write([...validBackupEntries(), { name, content: "x" }]);
      await expect(validateBackupArchive(file)).rejects.toThrow();
    }
  });
});

describe("restoring a backup that carries dumps", () => {
  it("puts the dumps in the data folder and leaves a marker for the pause step", async () => {
    const info = await createBackup({ dataDir, kind: "full", dumps: [dumpFile(DUMP, "ROWS")] });
    const archive = path.join(dataDir, "backups", info.name);

    const target = fs.mkdtempSync(path.join(os.tmpdir(), "renver-bd-target-"));
    try {
      const result = await restoreBackup({ file: archive, dataDir: target });
      expect(result.dumps).toEqual([DUMP]);
      expect(fs.readFileSync(path.join(target, "db-dumps", DUMP), "utf8")).toBe("ROWS");
      expect(readRestoreMarker(target)).toEqual({ dumps: [DUMP] });
      clearRestoreMarker(target);
      expect(readRestoreMarker(target)).toBeNull();
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("never overwrites a dump that already exists with the same name", async () => {
    const info = await createBackup({ dataDir, kind: "manual", dumps: [dumpFile(DUMP, "FROM BACKUP")] });
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "renver-bd-target-"));
    try {
      fs.mkdirSync(path.join(target, "db-dumps"));
      fs.writeFileSync(path.join(target, "db-dumps", DUMP), "ALREADY HERE");
      await restoreBackup({ file: path.join(dataDir, "backups", info.name), dataDir: target });
      expect(fs.readFileSync(path.join(target, "db-dumps", DUMP), "utf8")).toBe("ALREADY HERE");
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("leaves a marker with no dumps for a backup that has none (everything is still paused afterwards)", async () => {
    const info = await createBackup({ dataDir, kind: "manual" });
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "renver-bd-target-"));
    try {
      const result = await restoreBackup({ file: path.join(dataDir, "backups", info.name), dataDir: target });
      expect(result.dumps).toEqual([]);
      expect(readRestoreMarker(target)).toEqual({ dumps: [] });
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEncryptedFile } from "@/lib/backup-crypto";
import {
  adoptUploadedBackup,
  backupPath,
  createBackup,
  listBackups,
  parseBackupName,
  pruneBackups,
  restoreBackup,
  validateBackupArchive,
} from "@/lib/backup";

const sqlite = process.getBuiltinModule("node:sqlite");
const PASS = "a long passphrase, kept elsewhere";
let dataDir: string;
let target: string;

function makeDatabase(file: string, note: string): void {
  const db = new sqlite.DatabaseSync(file);
  db.exec("CREATE TABLE IF NOT EXISTS projects (id TEXT); CREATE TABLE IF NOT EXISTS notes (text TEXT)");
  db.prepare("INSERT INTO notes (text) VALUES (?)").run(note);
  db.close();
}

const readNote = (file: string): string[] => {
  const db = new sqlite.DatabaseSync(file);
  const rows = (db.prepare("SELECT text FROM notes").all() as { text: string }[]).map((r) => r.text);
  db.close();
  return rows;
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-enc-data-"));
  target = fs.mkdtempSync(path.join(os.tmpdir(), "renver-enc-target-"));
  makeDatabase(path.join(dataDir, "renver.db"), "hello from the original");
  fs.writeFileSync(path.join(dataDir, "secret.key"), "TOP-SECRET-KEY-MATERIAL");
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(target, { recursive: true, force: true });
});

describe("encrypted backups", () => {
  it("are named .tar.gz.enc, are recognised as encrypted, and still parse as backups", async () => {
    const info = await createBackup({ dataDir, kind: "manual", passphrase: PASS });
    expect(info.name.endsWith(".tar.gz.enc")).toBe(true);
    expect(info.encrypted).toBe(true);
    expect(parseBackupName(info.name)?.kind).toBe("manual");
    expect(isEncryptedFile(backupPath(dataDir, info.name))).toBe(true);
    expect(listBackups(dataDir).map((b) => [b.name, b.encrypted])).toEqual([[info.name, true]]);
  });

  it("never leave the key or database readable in the file, or a temporary plain copy behind", async () => {
    const info = await createBackup({ dataDir, kind: "full", passphrase: PASS });
    const bytes = fs.readFileSync(backupPath(dataDir, info.name));
    expect(bytes.includes("TOP-SECRET-KEY-MATERIAL")).toBe(false);
    expect(bytes.includes("SQLite format 3")).toBe(false);
    const leftovers = fs.readdirSync(path.join(dataDir, "backups")).filter((n) => !parseBackupName(n));
    expect(leftovers).toEqual([]);
  });

  it("can be read with the passphrase and not without it", async () => {
    const info = await createBackup({ dataDir, kind: "manual", passphrase: PASS });
    const file = backupPath(dataDir, info.name);
    await expect(validateBackupArchive(file, PASS)).resolves.toMatchObject({ format: 1, kind: "manual" });
    await expect(validateBackupArchive(file)).rejects.toThrow(/encrypted/i);
    await expect(validateBackupArchive(file, "wrong")).rejects.toThrow(/passphrase/i);
  });

  it("restore with the right passphrase, bringing back the database and key", async () => {
    const info = await createBackup({ dataDir, kind: "manual", passphrase: PASS });
    const result = await restoreBackup({ file: backupPath(dataDir, info.name), dataDir: target, passphrase: PASS });
    expect(result.restored).toContain("renver.db");
    expect(readNote(path.join(target, "renver.db"))).toEqual(["hello from the original"]);
    expect(fs.readFileSync(path.join(target, "secret.key"), "utf8")).toBe("TOP-SECRET-KEY-MATERIAL");
  });

  it("refuse to restore with a wrong or missing passphrase, and change nothing", async () => {
    const info = await createBackup({ dataDir, kind: "manual", passphrase: PASS });
    const file = backupPath(dataDir, info.name);
    await expect(restoreBackup({ file, dataDir: target, passphrase: "wrong" })).rejects.toThrow(/passphrase/i);
    await expect(restoreBackup({ file, dataDir: target })).rejects.toThrow(/encrypted/i);
    expect(fs.existsSync(path.join(target, "renver.db"))).toBe(false);
    expect(fs.readdirSync(target).filter((n) => n.startsWith(".restore-"))).toEqual([]);
  });

  it("are accepted when uploaded, and kept encrypted", async () => {
    const info = await createBackup({ dataDir, kind: "full", passphrase: PASS });
    const upload = path.join(os.tmpdir(), `renver-upload-${Date.now()}.bin`);
    fs.copyFileSync(backupPath(dataDir, info.name), upload);
    try {
      const adopted = await adoptUploadedBackup({ dataDir: target, file: upload, passphrase: PASS });
      expect(adopted.encrypted).toBe(true);
      expect(adopted.kind).toBe("full");
      expect(adopted.name.endsWith(".tar.gz.enc")).toBe(true);
    } finally {
      fs.rmSync(upload, { force: true });
    }
  });

  it("are refused on upload when the server has no passphrase for them", async () => {
    const info = await createBackup({ dataDir, kind: "manual", passphrase: PASS });
    const upload = path.join(os.tmpdir(), `renver-upload-${Date.now()}-2.bin`);
    fs.copyFileSync(backupPath(dataDir, info.name), upload);
    try {
      await expect(adoptUploadedBackup({ dataDir: target, file: upload })).rejects.toThrow(/encrypted/i);
    } finally {
      fs.rmSync(upload, { force: true });
    }
  });

  it("are pruned like any other automatic backup", async () => {
    for (let i = 0; i < 3; i++) await createBackup({ dataDir, kind: "auto", passphrase: PASS, now: new Date(Date.UTC(2026, 0, 1 + i)) });
    expect(pruneBackups(dataDir, 1)).toBe(2);
    expect(listBackups(dataDir)).toHaveLength(1);
  });
});

describe("plain backups keep working", () => {
  it("are not marked encrypted and need no passphrase", async () => {
    const info = await createBackup({ dataDir, kind: "manual" });
    expect(info.encrypted).toBe(false);
    expect(info.name.endsWith(".tar.gz")).toBe(true);
    await expect(validateBackupArchive(backupPath(dataDir, info.name))).resolves.toBeTruthy();
  });

  it("restore even when a passphrase happens to be set on the server", async () => {
    const info = await createBackup({ dataDir, kind: "manual" });
    await restoreBackup({ file: backupPath(dataDir, info.name), dataDir: target, passphrase: PASS });
    expect(readNote(path.join(target, "renver.db"))).toEqual(["hello from the original"]);
  });
});

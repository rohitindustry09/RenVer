import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "@/lib/db";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-live-"));
process.env.RENVER_DATA_DIR = dataDir;
delete process.env.RENVER_SECRET;

const projectConfig: ProjectConfig = {
  framework: "static",
  kind: "static",
  installCommand: null,
  buildCommand: null,
  startCommand: null,
  outputDir: ".",
  port: 80,
  nodeVersion: "22",
  packageManager: "npm",
};

const globalDb = globalThis as { __renverDb?: { close(): void } };
afterAll(() => {
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const load = async () => ({
  db: await import("@/lib/db"),
  live: await import("@/lib/restore-live"),
  backup: await import("@/lib/backup"),
  secrets: await import("@/lib/secrets"),
});

type Db = Awaited<ReturnType<typeof load>>["db"];
function addProject(db: Db, name: string, slug: string, envEncrypted: string | null = null) {
  const domain = db.listDomains()[0]!;
  return db.createProject({
    name,
    subdomain: slug,
    primaryHost: `${slug}.${domain.name}`,
    domainId: domain.id,
    config: projectConfig,
    envEncrypted,
  });
}

describe("restoreLive", () => {
  it("replaces the running panel's data with the backup's and reports what came back", async () => {
    const { db, live, backup } = await load();
    addProject(db, "Keep me", "keep-me");
    const info = await backup.createBackup({ dataDir, kind: "manual" });

    // Changes made after the backup: one project removed, another added.
    db.deleteProject(db.getProjectBySubdomain("keep-me")!.id);
    addProject(db, "Added later", "added-later");

    const summary = await live.restoreLive({ name: info.name, dataDir });

    expect(db.listProjects().map((p) => p.name)).toEqual(["Keep me"]);
    expect(summary.projects).toBe(1);
    expect(summary.restored).toContain("renver.db");
  });

  it("takes a safety backup of the current state first, so the restore can be undone", async () => {
    const { db, live, backup } = await load();
    const info = await backup.createBackup({ dataDir, kind: "manual", now: new Date(Date.now() - 60_000) });
    addProject(db, "Only now", "only-now");
    const before = backup.listBackups(dataDir).length;

    const summary = await live.restoreLive({ name: info.name, dataDir });

    expect(backup.listBackups(dataDir).length).toBe(before + 1);
    expect(summary.safetyBackup).toMatch(/^renver-backup-.*-manual\.tar\.gz$/);
    expect(db.getProjectBySubdomain("only-now")).toBeNull();

    // Undo: restore the safety backup and the project is back.
    await live.restoreLive({ name: summary.safetyBackup, dataDir });
    expect(db.getProjectBySubdomain("only-now")).not.toBeNull();
  });

  it("uses the restored encryption key, not the one cached in memory", async () => {
    const { db, live, backup, secrets } = await load();
    const envEncrypted = secrets.encryptEnv({ TOKEN: "abc123" })!;
    addProject(db, "With secrets", "with-secrets", envEncrypted);
    const info = await backup.createBackup({ dataDir, kind: "manual", now: new Date(Date.now() - 30_000) });
    const originalKey = fs.readFileSync(path.join(dataDir, "secret.key"), "utf8");

    // The live panel is now using a different key than the backup holds.
    fs.writeFileSync(path.join(dataDir, "secret.key"), Buffer.alloc(32, 7).toString("base64"));
    secrets.resetMasterKey();
    expect(() => secrets.decryptEnv(envEncrypted)).toThrow();

    await live.restoreLive({ name: info.name, dataDir });

    expect(fs.readFileSync(path.join(dataDir, "secret.key"), "utf8")).toBe(originalKey);
    expect(secrets.decryptEnv(db.getProjectBySubdomain("with-secrets")!.envEncrypted)).toEqual({ TOKEN: "abc123" });
  });

  it("refuses while a deploy is running, and changes nothing", async () => {
    const { db, live, backup } = await load();
    const info = await backup.createBackup({ dataDir, kind: "manual", now: new Date(Date.now() - 20_000) });
    const busy = addProject(db, "Busy", "busy-one");
    db.updateProject(busy.id, { status: "deploying" });
    const before = backup.listBackups(dataDir).length;

    await expect(live.restoreLive({ name: info.name, dataDir })).rejects.toMatchObject({ status: 409 });

    expect(db.getProject(busy.id)).not.toBeNull();
    expect(backup.listBackups(dataDir).length).toBe(before);
    db.updateProject(busy.id, { status: "failed" });
  });

  it("refuses while a build is queued", async () => {
    const { db, live, backup } = await load();
    const info = await backup.createBackup({ dataDir, kind: "manual", now: new Date(Date.now() - 10_000) });
    const project = addProject(db, "Queued", "queued-one");
    const deploy = db.createDeploy(project.id);
    await expect(live.restoreLive({ name: info.name, dataDir })).rejects.toMatchObject({ status: 409 });
    db.updateDeploy(deploy.id, "failed", "test");
  });

  it("rolls everything back if the restored database turns out to be unusable", async () => {
    const { db, live, backup } = await load();
    addProject(db, "Original", "original-one");
    const info = await backup.createBackup({ dataDir, kind: "manual", now: new Date(Date.now() - 5_000) });
    const keyBefore = fs.readFileSync(path.join(dataDir, "secret.key"), "utf8");
    db.deleteProject(db.getProjectBySubdomain("original-one")!.id);
    addProject(db, "Live now", "live-now");

    await expect(
      live.restoreLive({
        name: info.name,
        dataDir,
        verify: () => {
          throw new Error("file is not a database");
        },
      }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/nothing was changed/i) });

    // The live panel is exactly as it was: same data, same key, still usable.
    expect(db.listProjects().map((p) => p.subdomain)).toContain("live-now");
    expect(db.getProjectBySubdomain("original-one")).toBeNull();
    expect(fs.readFileSync(path.join(dataDir, "secret.key"), "utf8")).toBe(keyBefore);
  });

  it("refuses a backup holding a junk database before taking a safety backup or closing anything", async () => {
    const { db, live, backup } = await load();
    const { makeTarGz, validBackupEntries } = await import("./helpers/tar");
    const name = "renver-backup-20200303T000000Z-manual.tar.gz";
    fs.writeFileSync(path.join(dataDir, "backups", name), makeTarGz(validBackupEntries([], "definitely not sqlite")));
    const before = backup.listBackups(dataDir).length;
    const projectsBefore = db.listProjects().length;

    await expect(live.restoreLive({ name, dataDir })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/damaged/i) });

    expect(backup.listBackups(dataDir).length).toBe(before);
    expect(db.listProjects().length).toBe(projectsBefore);
  });

  it("refuses a backup that does not exist or has a bad name", async () => {
    const { live } = await load();
    await expect(live.restoreLive({ name: "renver-backup-20200101T000000Z-manual.tar.gz", dataDir })).rejects.toMatchObject({ status: 404 });
    await expect(live.restoreLive({ name: "../../etc/passwd", dataDir })).rejects.toMatchObject({ status: 400 });
  });

  it("refuses an invalid archive before closing the database or taking a safety backup", async () => {
    const { db, live, backup } = await load();
    const bad = path.join(dataDir, "backups", "renver-backup-20200202T000000Z-manual.tar.gz");
    fs.writeFileSync(bad, "not an archive");
    const before = backup.listBackups(dataDir).length;
    await expect(live.restoreLive({ name: path.basename(bad), dataDir })).rejects.toMatchObject({ status: 400 });
    expect(backup.listBackups(dataDir).length).toBe(before);
    expect(db.listProjects().length).toBeGreaterThan(0);
  });
});

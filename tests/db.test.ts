import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ProjectConfig } from "@/lib/db";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-db-"));
process.env.RENVER_DATA_DIR = dataDir;

const projectConfig: ProjectConfig = {
  framework: "nextjs",
  kind: "server",
  installCommand: "npm ci",
  buildCommand: "npm run build",
  startCommand: "npm run start",
  outputDir: null,
  port: 3000,
  nodeVersion: "22",
  packageManager: "npm",
};

type Db = typeof import("@/lib/db");

/** A project on a subdomain of the seeded base domain. */
function makeProject(db: Db, name: string, subdomain: string, envEncrypted: string | null = null) {
  const domain = db.listDomains()[0]!;
  return db.createProject({
    name,
    subdomain,
    primaryHost: `${subdomain}.${domain.name}`,
    domainId: domain.id,
    config: projectConfig,
    envEncrypted,
  });
}

const globalDb = globalThis as { __renverDb?: { close(): void } };

afterAll(() => {
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("projects", () => {
  it("stores projects and enforces unique project names", async () => {
    const db = await import("@/lib/db");
    const created = makeProject(db, "A", "alpha");
    expect(db.getProjectBySubdomain("alpha")?.id).toBe(created.id);
    expect(created.primaryHost).toBe("alpha.localhost");
    expect(() => makeProject(db, "B", "alpha")).toThrow(/UNIQUE/i);
  });

  it("patches only the fields provided", async () => {
    const db = await import("@/lib/db");
    const p = makeProject(db, "C", "gamma");
    db.updateProject(p.id, { status: "running", container: "c1", hostPort: 4001 });
    db.updateProject(p.id, { status: "failed" });
    const after = db.getProject(p.id)!;
    expect(after.status).toBe("failed");
    expect(after.container).toBe("c1");
    expect(after.hostPort).toBe(4001);
  });

  it("remembers the source of each deploy and lists deploys across projects", async () => {
    const db = await import("@/lib/db");
    const p = makeProject(db, "Hist", "history");
    db.createDeploy(p.id, "upload-one");
    db.createDeploy(p.id, "upload-two");
    db.createDeploy(p.id);
    expect(db.latestUploadId(p.id)).toBe("upload-two");
    const all = db.listAllDeploys();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all[0]).toMatchObject({ projectName: expect.any(String), primaryHost: expect.stringMatching(/\.localhost$/) });
    expect(db.latestUploadId("no-such-project")).toBeNull();
  });

  it("replaces a project's encrypted env", async () => {
    const db = await import("@/lib/db");
    const p = makeProject(db, "Env", "envtest", "old");
    db.updateProjectEnv(p.id, "new");
    expect(db.getProject(p.id)?.envEncrypted).toBe("new");
    db.updateProjectEnv(p.id, null);
    expect(db.getProject(p.id)?.envEncrypted).toBeNull();
  });
});

describe("domains and hostnames", () => {
  it("seeds the environment's base domain as a verified domain", async () => {
    const db = await import("@/lib/db");
    const seeded = db.getDomainByName("localhost");
    expect(seeded).toMatchObject({ status: "verified" });
    expect(seeded?.verifiedAt).not.toBeNull();
  });

  it("tracks pending domains until they are verified", async () => {
    const db = await import("@/lib/db");
    const domain = db.createDomain({ name: "example.com", token: "tok123", status: "pending" });
    expect(domain).toMatchObject({ status: "pending", verifiedAt: null, token: "tok123" });
    db.markDomainVerified(domain.id);
    expect(db.getDomain(domain.id)).toMatchObject({ status: "verified" });
    expect(() => db.createDomain({ name: "example.com", token: "x", status: "pending" })).toThrow(/UNIQUE/i);
  });

  it("creates a project and its first hostname together, or neither", async () => {
    const db = await import("@/lib/db");
    const domain = db.listDomains()[0]!;
    makeProject(db, "First", "claimed");
    const before = db.listProjects().length;
    expect(() =>
      db.createProject({
        name: "Second",
        subdomain: "other-slug",
        primaryHost: "claimed.localhost",
        domainId: domain.id,
        config: projectConfig,
        envEncrypted: null,
      }),
    ).toThrow(/UNIQUE/i);
    expect(db.listProjects().length).toBe(before);
    expect(db.getProjectBySubdomain("other-slug")).toBeNull();
  });

  it("adds, lists and removes hostnames; a removed primary host is replaced", async () => {
    const db = await import("@/lib/db");
    const root = db.createDomain({ name: "hosts.test", token: "t", status: "verified" });
    const p = makeProject(db, "Multi", "multi");
    db.addProjectHost({ host: "hosts.test", projectId: p.id, domainId: root.id });
    db.addProjectHost({ host: "www.hosts.test", projectId: p.id, domainId: root.id });
    expect(db.listProjectHosts(p.id).map((h) => h.host)).toEqual(
      expect.arrayContaining(["multi.localhost", "hosts.test", "www.hosts.test"]),
    );
    expect(db.getHostBinding("hosts.test")?.projectId).toBe(p.id);
    expect(db.listHostsForDomain(root.id)).toHaveLength(2);
    expect(() => db.addProjectHost({ host: "hosts.test", projectId: p.id, domainId: root.id })).toThrow(/UNIQUE/i);

    db.removeProjectHost(p.id, "multi.localhost");
    const after = db.getProject(p.id)!;
    expect(after.primaryHost).not.toBe("multi.localhost");
    expect(db.listProjectHosts(p.id).map((h) => h.host)).toContain(after.primaryHost);
  });

  it("will not delete a domain that still has hostnames", async () => {
    const db = await import("@/lib/db");
    const domain = db.createDomain({ name: "inuse.test", token: "t", status: "verified" });
    const p = makeProject(db, "InUse", "inuse");
    db.addProjectHost({ host: "inuse.test", projectId: p.id, domainId: domain.id });
    expect(() => db.deleteDomain(domain.id)).toThrow();
    db.removeProjectHost(p.id, "inuse.test");
    db.deleteDomain(domain.id);
    expect(db.getDomain(domain.id)).toBeNull();
  });

  it("builds proxy routes from running projects with all of their hostnames", async () => {
    const db = await import("@/lib/db");
    const domain = db.createDomain({ name: "routes.test", token: "t", status: "verified" });
    const p = makeProject(db, "Routed", "routed");
    db.addProjectHost({ host: "routes.test", projectId: p.id, domainId: domain.id });
    db.updateProject(p.id, { status: "running", container: "c", hostPort: 4777 });
    const route = db.listRunningRoutes().find((r) => r.port === 4777);
    expect(route?.hosts).toEqual(expect.arrayContaining(["routed.localhost", "routes.test"]));

    db.updateProject(p.id, { status: "failed" });
    expect(db.listRunningRoutes().find((r) => r.port === 4777)).toBeUndefined();
  });

  it("stores and clears settings", async () => {
    const db = await import("@/lib/db");
    expect(db.getSetting("server_ip")).toBeNull();
    db.setSetting("server_ip", "203.0.113.7");
    expect(db.getSetting("server_ip")).toBe("203.0.113.7");
    db.setSetting("server_ip", "198.51.100.1");
    expect(db.getSetting("server_ip")).toBe("198.51.100.1");
    db.setSetting("server_ip", null);
    expect(db.getSetting("server_ip")).toBeNull();
  });
});

describe("migrations and recovery", () => {
  it("upgrades a database created before domains and upload ids existed", async () => {
    const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-old-"));
    const sqlite = process.getBuiltinModule("node:sqlite");
    const legacy = new sqlite.DatabaseSync(path.join(oldDir, "renver.db"));
    legacy.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, subdomain TEXT NOT NULL UNIQUE, config TEXT NOT NULL, env_encrypted TEXT, status TEXT NOT NULL, container TEXT, host_port INTEGER, created_at TEXT NOT NULL);
      CREATE TABLE deploys (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, finished_at TEXT);
      INSERT INTO projects VALUES ('p1','Old','old','${JSON.stringify(projectConfig)}',NULL,'running',NULL,NULL,'2026-01-01');
      INSERT INTO deploys (id, project_id, status, created_at) VALUES ('d1','p1','live','2026-01-01');`);
    legacy.close();

    globalDb.__renverDb?.close();
    globalDb.__renverDb = undefined;
    vi.resetModules();
    process.env.RENVER_DATA_DIR = oldDir;
    const upgraded = await import("@/lib/db");

    expect(upgraded.getDeploy("d1")?.uploadId).toBeNull();
    const fresh = upgraded.createDeploy("p1", "up-9");
    expect(upgraded.getDeploy(fresh.id)?.uploadId).toBe("up-9");

    // The old project keeps working: it gets subdomain.basedomain as its first hostname.
    const project = upgraded.getProject("p1")!;
    expect(project.primaryHost).toBe("old.localhost");
    expect(upgraded.listProjectHosts("p1").map((h) => h.host)).toEqual(["old.localhost"]);
    expect(upgraded.getDomainByName("localhost")?.status).toBe("verified");

    globalDb.__renverDb?.close();
    globalDb.__renverDb = undefined;
    process.env.RENVER_DATA_DIR = dataDir;
    vi.resetModules();
    fs.rmSync(oldDir, { recursive: true, force: true });
  });

  it("recovers interrupted deploys and stuck projects after a restart", async () => {
    const first = await import("@/lib/db");
    const fresh = makeProject(first, "F", "fresh");
    const live = makeProject(first, "L", "livev");
    first.updateProject(fresh.id, { status: "deploying" });
    first.updateProject(live.id, { status: "deploying", container: "old-container" });
    const deploy = first.createDeploy(fresh.id);
    first.updateDeploy(deploy.id, "building");

    globalDb.__renverDb?.close();
    globalDb.__renverDb = undefined;
    vi.resetModules();
    const restarted = await import("@/lib/db");

    expect(restarted.getProject(fresh.id)?.status).toBe("failed");
    expect(restarted.getProject(live.id)?.status).toBe("running");
    const recovered = restarted.getDeploy(deploy.id)!;
    expect(recovered.status).toBe("failed");
    expect(recovered.error).toMatch(/restart/i);
  });
});

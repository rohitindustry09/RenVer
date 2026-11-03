import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "@/lib/db";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-redeploy-"));
process.env.RENVER_DATA_DIR = dataDir;

const projectConfig: ProjectConfig = {
  framework: "static", kind: "static", installCommand: null, buildCommand: null, startCommand: null,
  outputDir: ".", port: 80, nodeVersion: "22", packageManager: "npm",
};

const globalDb = globalThis as { __renverDb?: { close(): void } };
afterAll(() => {
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function setup() {
  const db = await import("@/lib/db");
  const { startRedeploy, RedeployError } = await import("@/lib/redeploy");
  const domain = db.listDomains()[0];
  const make = (name: string) =>
    db.createProject({ name, subdomain: name, primaryHost: `${name}.${domain.name}`, domainId: domain.id, config: projectConfig, envEncrypted: null });
  return { db, startRedeploy, RedeployError, make };
}

const statusOf = (fn: () => unknown): number | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { status?: number }).status;
  }
  return undefined;
};

describe("startRedeploy", () => {
  it("rejects an unknown project", async () => {
    const { startRedeploy } = await setup();
    expect(statusOf(() => startRedeploy("missing"))).toBe(404);
  });

  it("rejects a project with no saved source", async () => {
    const { startRedeploy, make } = await setup();
    expect(statusOf(() => startRedeploy(make("nosource").id))).toBe(409);
  });

  it("will not roll back to another project's deployment", async () => {
    const { db, startRedeploy, make } = await setup();
    const a = make("proj-a");
    const b = make("proj-b");
    const foreign = db.createDeploy(b.id, "upload-b");
    expect(statusOf(() => startRedeploy(a.id, foreign.id))).toBe(404);
  });

  it("will not roll back to a deployment that has no saved source", async () => {
    const { db, startRedeploy, make } = await setup();
    const project = make("proj-c");
    const bare = db.createDeploy(project.id, null);
    expect(statusOf(() => startRedeploy(project.id, bare.id))).toBe(409);
  });

  it("reports when the saved source has been deleted", async () => {
    const { db, startRedeploy, make } = await setup();
    const project = make("proj-d");
    const old = db.createDeploy(project.id, "gone-upload");
    expect(statusOf(() => startRedeploy(project.id, old.id))).toBe(409);
  });

  it("refuses while a deploy is running", async () => {
    const { db, startRedeploy, make } = await setup();
    const project = make("proj-e");
    db.updateProject(project.id, { status: "deploying" });
    expect(statusOf(() => startRedeploy(project.id))).toBe(409);
  });
});

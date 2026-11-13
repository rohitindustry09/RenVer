import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, validateProjectName } from "@/lib/project-name";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-rename-"));
process.env.RENVER_DATA_DIR = dataDir;

const globalDb = globalThis as { __renverDb?: { close(): void } };
afterAll(() => {
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const load = async () => ({ db: await import("@/lib/db"), domains: await import("@/lib/domains") });

const CONFIG = { framework: "docker", kind: "server" as const, installCommand: null, buildCommand: null, startCommand: null, outputDir: null, port: 3000 };

async function makeProject(subdomain: string, host: string, domainId: string) {
  const { db } = await load();
  return db.createProject({ name: subdomain, subdomain, primaryHost: host, domainId, config: CONFIG, envEncrypted: null });
}

describe("validateProjectName", () => {
  it("trims, tidies spaces and accepts ordinary names", () => {
    expect(validateProjectName("  My   Shop ")).toEqual({ ok: true, value: "My Shop" });
    expect(validateProjectName("Sizify 2")).toEqual({ ok: true, value: "Sizify 2" });
    expect(validateProjectName("line\nbreak\ttab")).toEqual({ ok: true, value: "line break tab" });
  });

  it("refuses empty, control-character and too-long names", () => {
    for (const bad of ["", "   ", "bell\u0007char", "nul\u0000char", "x".repeat(MAX_NAME_LENGTH + 1)]) {
      expect(validateProjectName(bad).ok).toBe(false);
    }
  });
});

describe("renaming a project", () => {
  it("changes only the shown name", async () => {
    const { db } = await load();
    const domain = db.createDomain({ name: "rename.example", token: "t", status: "verified" });
    const project = await makeProject("shop", "shop.rename.example", domain.id);
    db.updateProjectName(project.id, "Shop (renamed)");
    const after = db.getProject(project.id)!;
    expect(after.name).toBe("Shop (renamed)");
    expect(after.subdomain).toBe("shop");
    expect(after.primaryHost).toBe("shop.rename.example");
  });
});

describe("replaceProjectHost", () => {
  it("swaps the main address for a new one in one step", async () => {
    const { db, domains } = await load();
    const domain = db.createDomain({ name: "swap.example", token: "t", status: "verified" });
    const project = await makeProject("swap", "old.swap.example", domain.id);

    const host = domains.replaceProjectHost(project.id, "old.swap.example", domain.id, "fresh");

    expect(host).toBe("fresh.swap.example");
    expect(db.getProject(project.id)!.primaryHost).toBe("fresh.swap.example");
    expect(db.listProjectHosts(project.id).map((h) => h.host)).toEqual(["fresh.swap.example"]);
    expect(db.getHostBinding("old.swap.example")).toBeNull();
  });

  it("keeps the main address when a different address is swapped", async () => {
    const { db, domains } = await load();
    const domain = db.createDomain({ name: "keep.example", token: "t", status: "verified" });
    const project = await makeProject("keep", "main.keep.example", domain.id);
    domains.addHostToProject(project.id, domain.id, "extra");

    domains.replaceProjectHost(project.id, "extra.keep.example", domain.id, "other");

    expect(db.getProject(project.id)!.primaryHost).toBe("main.keep.example");
    expect(db.listProjectHosts(project.id).map((h) => h.host).sort()).toEqual(["main.keep.example", "other.keep.example"]);
  });

  it("changes nothing when the new address is taken, the domain is not verified, or the old address is not the project's", async () => {
    const { db, domains } = await load();
    const verified = db.createDomain({ name: "safe.example", token: "t", status: "verified" });
    const unverified = db.createDomain({ name: "pending.example", token: "t", status: "pending" });
    const a = await makeProject("safe-a", "a.safe.example", verified.id);
    const b = await makeProject("safe-b", "b.safe.example", verified.id);

    expect(() => domains.replaceProjectHost(a.id, "a.safe.example", verified.id, "b")).toThrow(/already in use/);
    expect(() => domains.replaceProjectHost(a.id, "a.safe.example", unverified.id, "x")).toThrow(/Verify ownership/);
    expect(() => domains.replaceProjectHost(a.id, "b.safe.example", verified.id, "z")).toThrow(/not on this project/);
    expect(() => domains.replaceProjectHost("missing", "a.safe.example", verified.id, "z")).toThrow(/Project not found/);

    expect(db.listProjectHosts(a.id).map((h) => h.host)).toEqual(["a.safe.example"]);
    expect(db.getProject(a.id)!.primaryHost).toBe("a.safe.example");
    expect(db.listProjectHosts(b.id).map((h) => h.host)).toEqual(["b.safe.example"]);
  });
});

describe("starting point of the change-address dialog", () => {
  const domain = (id: string, name: string) => ({ id, name, status: "verified", isLocal: false }) as never;

  it("starts on the domain the current address is on, with the longest match, and its current name", async () => {
    const { homeDomainOf, labelWithin } = await import("@/components/project/ChangeAddressDialog");
    const domains = [domain("a", "example.com"), domain("b", "shop.example.com"), domain("c", "other.org")];
    expect(homeDomainOf("app.shop.example.com", domains)?.id).toBe("b");
    expect(homeDomainOf("app.example.com", domains)?.id).toBe("a");
    expect(homeDomainOf("unrelated.net", domains)).toBeUndefined();
    expect(labelWithin("app.shop.example.com", "shop.example.com")).toBe("app");
    expect(labelWithin("example.com", "example.com")).toBe("");
  });
});

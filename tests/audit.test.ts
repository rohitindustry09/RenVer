import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-audit-"));
process.env.RENVER_DATA_DIR = dataDir;

const globalDb = globalThis as { __renverDb?: { close(): void } };
afterAll(() => {
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const load = () => import("@/lib/db");

describe("audit log storage", () => {
  it("keeps entries newest first with who, what and on what", async () => {
    const db = await load();
    db.insertAudit({ actor: "203.0.113.7", action: "project.delete", target: "p1", detail: "" });
    db.insertAudit({ actor: "local", action: "backup.create", target: "", detail: "full" });
    const [latest, earlier] = db.listAudit(10);
    expect(latest).toMatchObject({ actor: "local", action: "backup.create", detail: "full" });
    expect(earlier).toMatchObject({ actor: "203.0.113.7", action: "project.delete", target: "p1" });
    expect(new Date(latest!.at).getTime()).toBeGreaterThan(0);
  });

  it("returns a limited page, and the next page", async () => {
    const db = await load();
    for (let i = 0; i < 5; i++) db.insertAudit({ actor: "a", action: "x.y", target: String(i) });
    expect(db.listAudit(3)).toHaveLength(3);
    expect(db.listAudit(3, 3).length).toBeGreaterThan(0);
    expect(db.listAudit(3)[0]!.id).toBeGreaterThan(db.listAudit(3, 3)[0]!.id);
  });

  it("cuts very long details so one entry cannot swell the database", async () => {
    const db = await load();
    db.insertAudit({ actor: "a", action: "x.y", detail: "d".repeat(5000) });
    expect(db.listAudit(1)[0]!.detail.length).toBeLessThanOrEqual(500);
  });

  it("forgets the oldest entries beyond the cap, and keeps the newest", async () => {
    const db = await load();
    for (let i = 0; i < db.AUDIT_KEEP + 20; i++) db.insertAudit({ actor: "bulk", action: "x.y", target: String(i) });
    const all = db.listAudit(db.AUDIT_KEEP + 100);
    expect(all.length).toBe(db.AUDIT_KEEP);
    expect(all[0]!.target).toBe(String(db.AUDIT_KEEP + 19));
  });

  it("records a repeated failure from the same address once a minute", async () => {
    const db = await load();
    const before = db.listAudit(db.AUDIT_KEEP + 100).length;
    for (let i = 0; i < 20; i++) db.insertAudit({ actor: "198.51.100.9", action: "auth.login.failed" });
    db.insertAudit({ actor: "198.51.100.10", action: "auth.login.failed" });
    expect(db.listAudit(db.AUDIT_KEEP + 100).length).toBe(before + 2);
  });

  it("keeps a flood of failures from pushing normal history out", async () => {
    const db = await load();
    db.insertAudit({ actor: "owner", action: "project.delete", target: "keep-me" });
    for (let i = 0; i < db.AUDIT_KEEP_FAILED + 50; i++) db.insertAudit({ actor: `bot-${i}`, action: "auth.login.failed" });
    const all = db.listAudit(db.AUDIT_KEEP + db.AUDIT_KEEP_FAILED + 100);
    expect(all.filter((e) => e.action === "auth.login.failed").length).toBe(db.AUDIT_KEEP_FAILED);
    expect(all.some((e) => e.target === "keep-me")).toBe(true);
  });
});

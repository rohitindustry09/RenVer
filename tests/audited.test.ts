import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AUDIT_LABELS } from "@/lib/audit-labels";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-audited-"));
process.env.RENVER_DATA_DIR = dataDir;

const globalDb = globalThis as { __renverDb?: { close(): void } };
afterAll(() => {
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const load = async () => ({ audited: (await import("@/lib/audited")).audited, db: await import("@/lib/db") });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const json = (status = 200) => new Response("{}", { status });

describe("audited", () => {
  it("records a successful request with who, what and on what, and still returns the response", async () => {
    const { audited, db } = await load();
    const handler = audited("project.delete", async () => json(200));
    const response = await handler(post({}, { "x-forwarded-for": "203.0.113.7" }), ctx({ id: "p-1" }));
    expect(response.status).toBe(200);
    expect(db.listAudit(1)[0]).toMatchObject({ actor: "203.0.113.7", action: "project.delete", target: "p-1" });
  });

  it("does not record a request that was refused or failed", async () => {
    const { audited, db } = await load();
    const before = db.listAudit(1000).length;
    for (const status of [400, 401, 404, 409, 500]) await audited("project.delete", async () => json(status))(post({}), ctx({ id: "x" }));
    expect(db.listAudit(1000).length).toBe(before);
  });

  it("adds a note built from the request body, which the handler can still read", async () => {
    const { audited, db } = await load();
    let seen: unknown;
    const handler = audited(
      "project.power",
      async (request: Request) => {
        seen = await request.json();
        return json(200);
      },
      { detail: (body) => String(body.action) },
    );
    await handler(post({ action: "pause" }), ctx({ id: "p-2" }));
    expect(seen).toEqual({ action: "pause" });
    expect(db.listAudit(1)[0]).toMatchObject({ action: "project.power", target: "p-2", detail: "pause" });
  });

  it("uses 'local' as the actor when no proxy reported an address", async () => {
    const { audited, db } = await load();
    await audited("backup.create", async () => json(201))(post({}), ctx({}));
    expect(db.listAudit(1)[0]).toMatchObject({ actor: "local", action: "backup.create", target: "" });
  });

  it("never breaks the request if the note cannot be built", async () => {
    const { audited } = await load();
    const handler = audited("x.y", async () => json(200), { detail: () => { throw new Error("boom"); } });
    expect((await handler(post({}), ctx({}))).status).toBe(200);
  });
});

describe("audit labels", () => {
  it("has a label for every action the routes record", () => {
    const root = path.resolve(__dirname, "..", "src");
    const used = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const source = fs.readFileSync(full, "utf8");
          // Action codes are dotted ("project.delete"); the first dotted string in each call is the action.
          for (const m of source.matchAll(/(?:audited|recordAudit)\([^;]*?"([a-z]+(?:\.[a-z0-9-]+)+)"/g)) used.add(m[1]!);
        }
      }
    };
    walk(root);
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((action) => !(action in AUDIT_LABELS))).toEqual([]);
  });
});

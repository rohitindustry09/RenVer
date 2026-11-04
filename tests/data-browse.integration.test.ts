import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseRecord } from "@/lib/db";
import { listTables, readTable } from "@/lib/data-browse";
import { viewCommand } from "@/lib/data-view";

/** Runs against a real PostgreSQL container. Skipped when Docker or the postgres:17 image is not on this machine. */
const docker = (...args: string[]) => spawnSync("docker", args, { encoding: "utf8", timeout: 60_000 });
const available = docker("image", "inspect", "postgres:17").status === 0;

const container = `renver-it-${randomBytes(4).toString("hex")}`;
const record = {
  id: "it",
  name: "it",
  engine: "postgres",
  version: "17",
  status: "running",
  error: null,
  container,
  volume: "",
  database: "it_db",
  username: "u_it",
  secretEncrypted: null,
  createdAt: new Date().toISOString(),
} as unknown as DatabaseRecord;

const psql = (sql: string) => docker("exec", "-i", container, "sh", "-c", "psql -X -q -h 127.0.0.1 -U u_it -d it_db -v ON_ERROR_STOP=1", "--", sql);
const sql = (text: string) => spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-h", "127.0.0.1", "-U", "u_it", "-d", "it_db", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", timeout: 30_000 });

describe.skipIf(!available)("reading a real PostgreSQL database", () => {
  beforeAll(async () => {
    docker("run", "-d", "--name", container, "-e", "POSTGRES_USER=u_it", "-e", "POSTGRES_PASSWORD=pw_it", "-e", "POSTGRES_DB=it_db", "postgres:17");
    for (let i = 0; i < 40; i++) {
      if (docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "u_it", "-d", "it_db").status === 0) {
        // The image restarts once after its first start; wait until it stays ready.
        await new Promise((r) => setTimeout(r, 1500));
        if (docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "u_it", "-d", "it_db").status === 0) break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const made = sql(`
      CREATE TABLE "Session" (id serial PRIMARY KEY, note text, data jsonb, at timestamptz DEFAULT now());
      INSERT INTO "Session" (note, data) VALUES ('first', '{"a": [1, 2]}'), (E'two\\nlines and "quotes"', NULL), (NULL, '{}'), ('émoji ✓', '[]');
      CREATE TABLE numbers (n int);
      INSERT INTO numbers SELECT generate_series(1, 120);
      CREATE TABLE empty_one (id int, label text);
    `);
    expect(made.status, made.stderr).toBe(0);
  }, 120_000);

  afterAll(() => {
    docker("rm", "-f", container);
  });

  it("lists the tables, with capitals intact", async () => {
    const names = (await listTables(record)).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Session", "numbers", "empty_one"]));
  });

  it("returns rows in column order, with NULL, newlines, quotes, unicode and JSON handled", async () => {
    const page = await readTable(record, "public", "Session", 0);
    expect(page.columns.map((c) => c.name)).toEqual(["id", "note", "data", "at"]);
    expect(page.rows).toHaveLength(4);
    expect(page.rows.map((r) => r[1])).toEqual(["first", 'two\nlines and "quotes"', null, "émoji ✓"]);
    expect(page.rows[0]![2]).toEqual({ a: [1, 2] });
    expect(page.counted).toBe(4);
  });

  it("pages 50 rows at a time and counts them", async () => {
    const first = await readTable(record, "public", "numbers", 0);
    const third = await readTable(record, "public", "numbers", 2);
    expect(first.rows).toHaveLength(50);
    expect(first.counted).toBe(120);
    expect(third.rows).toHaveLength(20);
  });

  it("knows the columns of an empty table", async () => {
    const page = await readTable(record, "public", "empty_one", 0);
    expect(page.rows).toEqual([]);
    expect(page.columns.map((c) => c.name)).toEqual(["id", "label"]);
  });

  it("refuses a table the database does not have, including an injection attempt", async () => {
    await expect(readTable(record, "public", 'Session"; DROP TABLE "Session"; --', 0)).rejects.toThrow(/not found|cannot be shown/);
    await expect(readTable(record, "public", "nope", 0)).rejects.toThrow("not found");
    expect((await readTable(record, "public", "Session", 0)).rows).toHaveLength(4);
  });

  it("cannot write: a read-only session rejects changes", () => {
    const [bin, flag, script] = viewCommand("postgres", "u_it", "it_db");
    const write = spawnSync("docker", ["exec", "-i", container, bin!, flag!, script!], { input: `INSERT INTO numbers VALUES (999);\n`, encoding: "utf8", timeout: 30_000 });
    expect(write.status).not.toBe(0);
    expect(write.stderr).toMatch(/read-only/i);
  });
});

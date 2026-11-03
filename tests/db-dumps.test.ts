import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDump, dumpDirFor, dumpFileName, dumpPath, listDumps, parseDumpName, pruneDumps } from "@/lib/db-dumps";
import { dumpCommand, restoreCommand } from "@/lib/database-spec";

let dataDir: string;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-dumps-"));
});
afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const at = (iso: string) => new Date(iso);
const touch = (name: string) => {
  const dir = dumpDirFor(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), "x");
};

describe("dump file names", () => {
  it("round-trips a name", () => {
    const name = dumpFileName("my-store", at("2026-11-02T10:30:05Z"), "manual");
    expect(name).toBe("my-store-20261102T103005Z-manual.sql.gz");
    expect(parseDumpName(name)).toEqual({ database: "my-store", createdAt: at("2026-11-02T10:30:05Z"), kind: "manual" });
  });

  it("rejects anything that is not exactly one of our names", () => {
    for (const bad of ["../evil.sql.gz", "a-20261102T103005Z-other.sql.gz", "a.sql.gz", "a/b-20261102T103005Z-auto.sql.gz"]) {
      expect(parseDumpName(bad)).toBeNull();
    }
  });
});

describe("dumpPath", () => {
  it("refuses a file that belongs to a different database", () => {
    expect(() => dumpPath(dataDir, "shop", "blog-20261102T103005Z-auto.sql.gz")).toThrow(/invalid/i);
    expect(() => dumpPath(dataDir, "shop", "../x")).toThrow(/invalid/i);
  });

  it("resolves a file of the right database", () => {
    expect(dumpPath(dataDir, "shop", "shop-20261102T103005Z-auto.sql.gz")).toContain("shop-20261102T103005Z-auto.sql.gz");
  });
});

describe("listDumps / pruneDumps / deleteDump", () => {
  it("lists only this database's dumps, newest first", () => {
    touch("shop-20261101T000000Z-auto.sql.gz");
    touch("shop-20261103T000000Z-manual.sql.gz");
    touch("blog-20261102T000000Z-auto.sql.gz");
    touch("notes.txt");
    expect(listDumps(dataDir, "shop").map((d) => d.name)).toEqual([
      "shop-20261103T000000Z-manual.sql.gz",
      "shop-20261101T000000Z-auto.sql.gz",
    ]);
  });

  it("does not mistake a database whose name starts with another's for it", () => {
    touch("shop-20261101T000000Z-auto.sql.gz");
    touch("shop-two-20261101T000000Z-auto.sql.gz");
    expect(listDumps(dataDir, "shop")).toHaveLength(1);
  });

  it("keeps the newest automatic dumps and never prunes manual ones", () => {
    for (const day of ["01", "02", "03", "04"]) touch(`shop-202611${day}T000000Z-auto.sql.gz`);
    touch("shop-20261001T000000Z-manual.sql.gz");
    expect(pruneDumps(dataDir, "shop", 2)).toBe(2);
    expect(listDumps(dataDir, "shop").map((d) => d.name)).toEqual([
      "shop-20261104T000000Z-auto.sql.gz",
      "shop-20261103T000000Z-auto.sql.gz",
      "shop-20261001T000000Z-manual.sql.gz",
    ]);
  });

  it("deletes one dump and reports a missing one", () => {
    touch("shop-20261101T000000Z-auto.sql.gz");
    deleteDump(dataDir, "shop", "shop-20261101T000000Z-auto.sql.gz");
    expect(listDumps(dataDir, "shop")).toEqual([]);
    expect(() => deleteDump(dataDir, "shop", "shop-20261101T000000Z-auto.sql.gz")).toThrow(/not found/i);
  });
});

describe("dump and restore commands", () => {
  it("builds one per engine, keeping passwords inside the container", () => {
    for (const engine of ["postgres", "mysql", "mariadb"] as const) {
      const dump = dumpCommand(engine, "u_shop", "shop").join(" ");
      const restore = restoreCommand(engine, "u_shop", "shop").join(" ");
      expect(dump).toContain("shop");
      expect(restore).toContain("shop");
      expect(dump + restore).not.toMatch(/secret|hunter2/);
    }
    expect(dumpCommand("postgres", "u_shop", "shop").join(" ")).toContain("pg_dump");
    expect(restoreCommand("postgres", "u_shop", "shop").join(" ")).toContain("psql");
    expect(dumpCommand("mysql", "u_shop", "shop").join(" ")).toContain("mysqldump");
    expect(dumpCommand("mariadb", "u_shop", "shop").join(" ")).toContain("mariadb-dump");
  });

  it("refuses identifiers that could escape the shell command", () => {
    expect(() => dumpCommand("postgres", "u; rm -rf /", "shop")).toThrow(/identifier/i);
    expect(() => restoreCommand("mysql", "u_shop", "shop`id`")).toThrow(/identifier/i);
  });
});

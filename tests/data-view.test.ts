import { describe, expect, it } from "vitest";
import { COUNT_CAP, PAGE_SIZE, isSafeName, pageSql, parsePage, parseTables, quoteIdent, tablesSql, viewCommand } from "@/lib/data-view";

describe("isSafeName / quoteIdent", () => {
  it("accepts ordinary table names, including capitals and spaces", () => {
    for (const name of ["users", "Session", "order items", "t$1", "données"]) expect(isSafeName(name)).toBe(true);
  });

  it("refuses names that could break out of the quotes", () => {
    for (const name of ["", 'a"b', "a'b", "a`b", "a;b", "a\\b", "a\nb", "x".repeat(200)]) expect(isSafeName(name)).toBe(false);
    expect(() => quoteIdent("postgres", 'x"; DROP TABLE y; --')).toThrow();
  });

  it("quotes for each engine", () => {
    expect(quoteIdent("postgres", "Session")).toBe('"Session"');
    expect(quoteIdent("mysql", "orders")).toBe("`orders`");
  });
});

describe("viewCommand", () => {
  it("is read-only with a time limit for PostgreSQL, and takes the password from the container's environment", () => {
    const [, , script] = viewCommand("postgres", "u_shop", "shop");
    expect(script).toContain("default_transaction_read_only=on");
    expect(script).toContain("statement_timeout=");
    expect(script).toContain('PGPASSWORD="$POSTGRES_PASSWORD"');
    expect(script).not.toMatch(/password=\w/i);
  });

  it("refuses odd database or user names", () => {
    expect(() => viewCommand("postgres", "u; rm", "shop")).toThrow();
    expect(() => viewCommand("mysql", "u", "sh op")).toThrow();
  });
});

describe("SQL builders", () => {
  it("builds only SELECT statements for a table page, with a bounded window", () => {
    const sql = pageSql("postgres", "public", "Session", 2);
    expect(sql).toContain('FROM "public"."Session" LIMIT 50 OFFSET 100');
    expect(sql).toContain(`LIMIT ${COUNT_CAP + 1}`);
    expect(sql).not.toMatch(/\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE)\b/i);
  });

  it("keeps the page window inside limits and refuses unsafe names", () => {
    expect(pageSql("postgres", "public", "t", -5)).toContain("OFFSET 0");
    expect(pageSql("postgres", "public", "t", 99_999_999)).toContain(`OFFSET ${20_000 * PAGE_SIZE}`);
    expect(() => pageSql("postgres", "public", 't"; DROP TABLE x;--', 0)).toThrow();
  });

  it("puts a read-only guard in front of MySQL and MariaDB queries", () => {
    expect(tablesSql("mysql")).toContain("READ ONLY");
    expect(tablesSql("mariadb")).toContain("max_statement_time");
    expect(pageSql("mysql", "", "orders", 0)).toContain("MAX_EXECUTION_TIME");
  });
});

describe("parseTables", () => {
  it("reads PostgreSQL JSON", () => {
    const json = JSON.stringify([{ schema: "public", name: "Session", estimate: 12 }, { schema: "app", name: "users", estimate: 0 }]);
    expect(parseTables("postgres", json)).toEqual([
      { schema: "public", name: "Session", estimate: 12 },
      { schema: "app", name: "users", estimate: 0 },
    ]);
    expect(parseTables("postgres", "")).toEqual([]);
  });

  it("reads MySQL tab-separated output", () => {
    expect(parseTables("mysql", "name\testimate\norders\t40\nusers\t0\n")).toEqual([
      { schema: "", name: "orders", estimate: 40 },
      { schema: "", name: "users", estimate: 0 },
    ]);
  });
});

describe("parsePage", () => {
  it("lines PostgreSQL rows up with the column order and fills missing values with null", () => {
    const out = JSON.stringify({
      columns: [{ name: "id", type: "integer" }, { name: "note", type: "text" }],
      rows: [{ note: "hi", id: 1 }, { id: 2 }],
      counted: 2,
    });
    const page = parsePage("postgres", out, 0);
    expect(page.rows).toEqual([[1, "hi"], [2, null]]);
    expect(page).toMatchObject({ counted: 2, isCapped: false, page: 0, pageSize: PAGE_SIZE });
  });

  it("marks a count that hit the cap", () => {
    const page = parsePage("postgres", JSON.stringify({ columns: [], rows: [], counted: COUNT_CAP + 1 }), 3);
    expect(page.isCapped).toBe(true);
    expect(page.counted).toBe(COUNT_CAP);
  });

  it("reads MySQL output with escapes and NULL, and still knows the columns of an empty table", () => {
    const out = "m\nRVSEP1\nname\ttype\nid\tint\nnote\ttext\nm\nRVSEP2\nid\tnote\n1\tline1\\nline2\n2\tNULL\nm\nRVSEP3\nc\n2\n";
    const page = parsePage("mysql", out, 0);
    expect(page.columns).toEqual([{ name: "id", type: "int" }, { name: "note", type: "text" }]);
    expect(page.rows).toEqual([["1", "line1\nline2"], ["2", null]]);
    expect(page.counted).toBe(2);

    const empty = "m\nRVSEP1\nname\ttype\nid\tint\nm\nRVSEP2\nm\nRVSEP3\nc\n0\n";
    const none = parsePage("mysql", empty, 0);
    expect(none.columns).toEqual([{ name: "id", type: "int" }]);
    expect(none.rows).toEqual([]);
  });
});

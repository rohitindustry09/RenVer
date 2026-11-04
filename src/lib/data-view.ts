import type { Engine } from "./database-engines";

/**
 * Read-only browsing of a database: which tables it has and the first rows of one table. Everything here only builds the
 * SQL and reads the answers; nothing here runs a command. No SQL typed by a person is ever used: table names must come
 * from the database's own list, and are then quoted.
 */

export const PAGE_SIZE = 50;
export const MAX_PAGE = 20_000;
/** Counting stops here, so a huge table does not make the page slow. */
export const COUNT_CAP = 100_000;
export const STATEMENT_TIMEOUT_SECONDS = 10;

export interface DataTable {
  schema: string;
  name: string;
  /** Rough number of rows, from the database's own statistics (can be 0 for a table never analysed). */
  estimate: number;
}

export interface DataColumn {
  name: string;
  type: string;
}

export interface DataPage {
  columns: DataColumn[];
  rows: unknown[][];
  /** Rows counted, up to COUNT_CAP. */
  counted: number;
  isCapped: boolean;
  page: number;
  pageSize: number;
}

/** A name safe to put between quotes in SQL. Real tables almost never use the characters this refuses. */
export const isSafeName = (name: string): boolean => name.length > 0 && name.length <= 128 && !/[\u0000-\u001f"'`\\;]/.test(name);

const sqlString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export function quoteIdent(engine: Engine, name: string): string {
  if (!isSafeName(name)) throw new Error("That table name cannot be shown.");
  return engine === "postgres" ? `"${name}"` : `\`${name}\``;
}

const IDENTIFIER = /^[A-Za-z0-9_]+$/;

/**
 * The command run inside the container; the SQL goes in on standard input. Passwords come from the container's own
 * environment. The session is read-only and every statement has a time limit.
 */
export function viewCommand(engine: Engine, username: string, database: string): string[] {
  if (!IDENTIFIER.test(username) || !IDENTIFIER.test(database)) throw new Error("Database identifier contains unsupported characters.");
  switch (engine) {
    case "postgres":
      return [
        "sh",
        "-c",
        `PGPASSWORD="$POSTGRES_PASSWORD" PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=${STATEMENT_TIMEOUT_SECONDS * 1000}" ` +
          `psql -X -q -A -t -h 127.0.0.1 -U ${username} -d ${database} -v ON_ERROR_STOP=1`,
      ];
    case "mysql":
      return ["sh", "-c", `mysql -h 127.0.0.1 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --batch --default-character-set=utf8mb4 ${database}`];
    case "mariadb":
      return ["sh", "-c", `mariadb -h 127.0.0.1 -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" --batch --default-character-set=utf8mb4 ${database}`];
  }
}

const mysqlGuard = (engine: Engine): string =>
  `SET SESSION TRANSACTION READ ONLY; ${engine === "mariadb" ? `SET SESSION max_statement_time=${STATEMENT_TIMEOUT_SECONDS};` : `SET SESSION MAX_EXECUTION_TIME=${STATEMENT_TIMEOUT_SECONDS * 1000};`}\n`;

export function tablesSql(engine: Engine): string {
  if (engine === "postgres") {
    return `SELECT COALESCE(json_agg(x ORDER BY x.schema, x.name), '[]'::json) FROM (
  SELECT t.table_schema AS schema, t.table_name AS name,
    GREATEST(COALESCE((SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = t.table_schema AND c.relname = t.table_name), 0), 0) AS estimate
  FROM information_schema.tables t
  WHERE t.table_type = 'BASE TABLE' AND t.table_schema NOT IN ('pg_catalog', 'information_schema') AND t.table_schema NOT LIKE 'pg_toast%'
) x;\n`;
  }
  return `${mysqlGuard(engine)}SELECT table_name AS name, COALESCE(table_rows, 0) AS estimate FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name;\n`;
}

export function pageSql(engine: Engine, schema: string, table: string, page: number): string {
  const offset = Math.max(0, Math.min(page, MAX_PAGE)) * PAGE_SIZE;
  if (engine === "postgres") {
    const from = `${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;
    return `SELECT json_build_object(
  'columns', (SELECT COALESCE(json_agg(json_build_object('name', column_name, 'type', data_type) ORDER BY ordinal_position), '[]'::json)
    FROM information_schema.columns WHERE table_schema = ${sqlString(schema)} AND table_name = ${sqlString(table)}),
  'rows', (SELECT COALESCE(json_agg(r), '[]'::json) FROM (SELECT * FROM ${from} LIMIT ${PAGE_SIZE} OFFSET ${offset}) r),
  'counted', (SELECT count(*) FROM (SELECT 1 FROM ${from} LIMIT ${COUNT_CAP + 1}) c)
);\n`;
  }
  const from = quoteIdent(engine, table);
  return `${mysqlGuard(engine)}SELECT 'RVSEP1' AS m;
SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${sqlString(table)} ORDER BY ordinal_position;
SELECT 'RVSEP2' AS m;
SELECT * FROM ${from} LIMIT ${PAGE_SIZE} OFFSET ${offset};
SELECT 'RVSEP3' AS m;
SELECT COUNT(*) AS c FROM (SELECT 1 FROM ${from} LIMIT ${COUNT_CAP + 1}) x;\n`;
}

/** mysql --batch escapes tabs, newlines and backslashes in values. */
function unescapeBatch(value: string): string {
  return value.replace(/\\([tnr0\\])/g, (_all, c: string) => (c === "t" ? "\t" : c === "n" ? "\n" : c === "r" ? "\r" : c === "0" ? "\0" : "\\"));
}

const cell = (value: string): string | null => (value === "NULL" ? null : unescapeBatch(value));
const tsvLines = (text: string): string[][] => text.split("\n").filter((l) => l !== "").map((l) => l.replace(/\r$/, "").split("\t"));

export function parseTables(engine: Engine, stdout: string): DataTable[] {
  if (engine === "postgres") {
    const parsed = JSON.parse(stdout.trim() || "[]") as { schema: string; name: string; estimate: number }[];
    return parsed.map((t) => ({ schema: t.schema, name: t.name, estimate: Number(t.estimate) || 0 }));
  }
  const [, ...rows] = tsvLines(stdout);
  return rows.map(([name, estimate]) => ({ schema: "", name: name ?? "", estimate: Number(estimate) || 0 }));
}

export function parsePage(engine: Engine, stdout: string, page: number): DataPage {
  if (engine === "postgres") {
    const parsed = JSON.parse(stdout.trim()) as { columns: DataColumn[]; rows: Record<string, unknown>[]; counted: number };
    const rows = parsed.rows.map((row) => parsed.columns.map((c) => row[c.name] ?? null));
    const counted = Math.min(Number(parsed.counted) || 0, COUNT_CAP);
    return { columns: parsed.columns, rows, counted, isCapped: Number(parsed.counted) > COUNT_CAP, page, pageSize: PAGE_SIZE };
  }
  const section = (from: string, to: string | null): string[][] => {
    const start = stdout.indexOf(`${from}\n`);
    if (start < 0) return [];
    const after = stdout.slice(start + from.length + 1);
    const end = to ? after.indexOf(`m\n${to}\n`) : -1;
    return tsvLines(end >= 0 ? after.slice(0, end) : after);
  };
  const columnLines = section("RVSEP1", "RVSEP2");
  const columns = columnLines.slice(1).map(([name, type]) => ({ name: name ?? "", type: type ?? "" }));
  const rowLines = section("RVSEP2", "RVSEP3").slice(1);
  const rows = rowLines.map((fields) => columns.map((_c, i) => cell(fields[i] ?? "NULL")));
  const counted = Number(section("RVSEP3", null)[1]?.[0]) || 0;
  return { columns, rows, counted: Math.min(counted, COUNT_CAP), isCapped: counted > COUNT_CAP, page, pageSize: PAGE_SIZE };
}

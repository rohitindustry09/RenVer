import { spawn } from "node:child_process";
import type { DatabaseRecord } from "./db";
import { isEngine, type Engine } from "./database-engines";
import { DatabaseError } from "./databases";
import { MAX_PAGE, pageSql, parsePage, parseTables, tablesSql, viewCommand, type DataPage, type DataTable } from "./data-view";

const TIMEOUT_MS = 25_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_STDERR_CHARS = 2000;

const lastLine = (text: string): string => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) ?? "no details";

/** Runs one read-only query inside the database container: the SQL goes in on standard input, the answer comes back as text. */
function runViewQuery(container: string, command: string[], sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, ...command], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let tooBig = false;
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        tooBig = true;
        child.kill();
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR_CHARS) stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (tooBig) return reject(new DatabaseError("That page holds too much data to show. Try a table with smaller values.", 413));
      if (code !== 0) return reject(new DatabaseError(`The database could not answer: ${lastLine(stderr)}`, 502));
      resolve(stdout);
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(sql);
  });
}

function runningEngine(record: DatabaseRecord): Engine {
  if (!isEngine(record.engine)) throw new DatabaseError("Unknown database engine.", 500);
  if (record.status !== "running") throw new DatabaseError("The database is not running. Resume it first.", 409);
  return record.engine;
}

export async function listTables(record: DatabaseRecord): Promise<DataTable[]> {
  const engine = runningEngine(record);
  const out = await runViewQuery(record.container, viewCommand(engine, record.username, record.database), tablesSql(engine));
  return parseTables(engine, out);
}

/**
 * The rows of one table. The table must be one the database itself lists, so only real tables can be read, and the page
 * number is limited so the database is never asked for something huge.
 */
export async function readTable(record: DatabaseRecord, schema: string, table: string, page: number): Promise<DataPage> {
  const engine = runningEngine(record);
  if (!Number.isInteger(page) || page < 0 || page > MAX_PAGE) throw new DatabaseError("That page does not exist.", 400);
  const known = await listTables(record);
  const match = known.find((t) => t.name === table && (engine !== "postgres" || t.schema === schema));
  if (!match) throw new DatabaseError("That table was not found in this database.", 404);
  const out = await runViewQuery(record.container, viewCommand(engine, record.username, record.database), pageSql(engine, match.schema, match.name, page));
  return parsePage(engine, out, page);
}

import { failFrom, ok } from "@/lib/api";
import { config } from "@/lib/config";
import { getDatabaseRecord } from "@/lib/db";
import { KEEP_AUTO_DUMPS, listDumps, pruneDumps } from "@/lib/db-dumps";
import { DatabaseError, dumpDatabase } from "@/lib/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function recordFor({ params }: Context) {
  const record = getDatabaseRecord((await params).id);
  if (!record) throw new DatabaseError("Database not found.", 404);
  return record;
}

export async function GET(_request: Request, context: Context) {
  try {
    const record = await recordFor(context);
    return ok({ dumps: listDumps(config.dataDir, record.name), keepAuto: KEEP_AUTO_DUMPS });
  } catch (error) {
    return failFrom(error);
  }
}

/** Saves the database's contents now. */
export async function POST(_request: Request, context: Context) {
  try {
    const record = await recordFor(context);
    const dump = await dumpDatabase(record, "manual");
    pruneDumps(config.dataDir, record.name);
    return ok(dump, 201);
  } catch (error) {
    return failFrom(error, 500);
  }
}

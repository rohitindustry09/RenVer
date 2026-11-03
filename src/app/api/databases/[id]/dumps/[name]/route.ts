import fs from "node:fs";
import { Readable } from "node:stream";
import { failFrom, ok } from "@/lib/api";
import { config } from "@/lib/config";
import { getDatabaseRecord } from "@/lib/db";
import { deleteDump, dumpPath } from "@/lib/db-dumps";
import { DatabaseError, restoreDump } from "@/lib/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; name: string }> };

async function resolve({ params }: Context) {
  const { id, name } = await params;
  const record = getDatabaseRecord(id);
  if (!record) throw new DatabaseError("Database not found.", 404);
  return { record, name };
}

/** Downloads the dump. It holds the database's data, so it is only served behind the panel login. */
export async function GET(_request: Request, context: Context) {
  try {
    const { record, name } = await resolve(context);
    const file = dumpPath(config.dataDir, record.name, name);
    if (!fs.existsSync(file)) throw new DatabaseError("Backup not found.", 404);
    return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(fs.statSync(file).size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failFrom(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { record, name } = await resolve(context);
    deleteDump(config.dataDir, record.name, name);
    return ok({ deleted: name });
  } catch (error) {
    return failFrom(error, error instanceof Error && /not found/i.test(error.message) ? 404 : 400);
  }
}

/** Replaces the database's contents with this dump, after saving the current contents. */
export async function POST(_request: Request, context: Context) {
  try {
    const { record, name } = await resolve(context);
    return ok(await restoreDump(record, name));
  } catch (error) {
    return failFrom(error, 500);
  }
}

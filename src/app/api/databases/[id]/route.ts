import { fail, ok, publicDatabase } from "@/lib/api";
import { getDatabaseRecord } from "@/lib/db";
import { deleteDatabase } from "@/lib/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const record = getDatabaseRecord((await params).id);
  return record ? ok(publicDatabase(record)) : fail("Database not found.", 404);
}

/** Deleting destroys the data, so the caller must repeat the database's name as confirmation. */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const record = getDatabaseRecord((await params).id);
    if (!record) return fail("Database not found.", 404);
    if (new URL(request.url).searchParams.get("confirm") !== record.name) {
      return fail("Type the database name to confirm deleting it.", 400);
    }
    await deleteDatabase(record);
    return ok({ deleted: record.id });
  } catch (error) {
    return fail(error, 500);
  }
}

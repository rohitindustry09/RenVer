import fs from "node:fs";
import { Readable } from "node:stream";
import { fail, ok } from "@/lib/api";
import { backupPath, deleteBackup, isEncryptedBackupName } from "@/lib/backup";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

/** Downloads the archive. It holds the encryption key, so it is only served behind the panel login. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { name } = await params;
    const file = backupPath(config.dataDir, name);
    if (!fs.existsSync(file)) return fail("Backup not found.", 404);
    return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": isEncryptedBackupName(name) ? "application/octet-stream" : "application/gzip",
        "Content-Length": String(fs.statSync(file).size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { name } = await params;
    deleteBackup(config.dataDir, name);
    return ok({ deleted: name });
  } catch (error) {
    return fail(error, error instanceof Error && /not found/i.test(error.message) ? 404 : 400);
  }
}

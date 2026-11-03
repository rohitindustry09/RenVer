import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { fail, failFrom, ok } from "@/lib/api";
import { adoptUploadedBackup } from "@/lib/backup";
import { describeBackup } from "@/lib/backup-view";
import { config } from "@/lib/config";
import { guardRequest } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

class TooLargeError extends Error {
  readonly status = 413;
  constructor() {
    super("That file is larger than the 1 GB limit for backups.");
  }
}

/** Counts bytes as they pass and aborts the upload once the limit is crossed. */
function limitBytes(max: number): Transform {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > max) callback(new TooLargeError());
      else callback(null, chunk);
    },
  });
}

/**
 * Receives a backup file as the raw request body and streams it to disk, so large files never sit in memory.
 * It is excluded from the middleware (Next.js would cut the body off at 10 MB there), so it checks the login itself.
 * Nothing is trusted until the archive has been validated.
 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  if (!request.body) return fail("No file was received.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return failFrom(new TooLargeError());

  const dir = path.join(config.dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const partial = path.join(dir, `.upload-${randomBytes(6).toString("hex")}.partial`);

  try {
    await pipeline(Readable.fromWeb(request.body as unknown as NodeWebStream), limitBytes(MAX_UPLOAD_BYTES), fs.createWriteStream(partial));
    const info = await adoptUploadedBackup({ dataDir: config.dataDir, file: partial });
    return ok(describeBackup(info), 201);
  } catch (error) {
    return failFrom(error);
  } finally {
    fs.rmSync(partial, { force: true });
  }
}

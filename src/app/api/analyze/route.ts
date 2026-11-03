import { audited } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { guardRequest } from "@/lib/guard";
import { getSessionEpoch } from "@/lib/session-epoch";
import { MAX_UPLOAD_BYTES, saveAndAnalyze } from "@/lib/uploads";

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  // Not covered by the middleware (see middleware.ts), so it checks the login and cross-site rules itself.
  const blocked = await guardRequest(request, getSessionEpoch());
  if (blocked) return blocked;

  try {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return fail("Zip is larger than the 200 MB limit.", 413);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Choose a .zip file to upload.");
    return ok(await saveAndAnalyze(file));
  } catch (error) {
    return fail(error);
  }
}

export const POST = audited("source.upload", handlePOST);

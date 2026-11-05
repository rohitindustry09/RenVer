import { audited } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { runCleanup, scanDisk } from "@/lib/cleanup-run";
import { DatabaseError } from "@/lib/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What could be cleaned, with sizes, and for each part whether it can hold data. Nothing is changed. */
export async function GET() {
  try {
    return ok(await scanDisk());
  } catch (error) {
    return fail(error, error instanceof DatabaseError ? error.status : 500);
  }
}

/** Body: `{ "buildCache": true, "images": true, "volumes": ["name", …] }`. */
async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as { buildCache?: unknown; images?: unknown; volumes?: unknown };
    const volumes = Array.isArray(body.volumes) ? body.volumes.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 200) : [];
    return ok(await runCleanup({ buildCache: body.buildCache === true, images: body.images === true, volumes }));
  } catch (error) {
    return fail(error, error instanceof DatabaseError ? error.status : 500);
  }
}

export const POST = audited("system.cleanup", handlePOST, {
  detail: (b) => [b.buildCache === true ? "build cache" : "", b.images === true ? "images" : "", Array.isArray(b.volumes) && b.volumes.length ? `${b.volumes.length} volume(s)` : ""].filter(Boolean).join(", ") || undefined,
});

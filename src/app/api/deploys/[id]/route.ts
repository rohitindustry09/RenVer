import { fail, ok } from "@/lib/api";
import { getDeploy } from "@/lib/db";
import { readLog } from "@/lib/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deploy = getDeploy(id);
    if (!deploy) return fail("Deploy not found.", 404);
    const offset = Math.max(0, Number(new URL(request.url).searchParams.get("offset") ?? 0) || 0);
    return ok({ deploy, log: readLog(id, offset) });
  } catch (error) {
    return fail(error);
  }
}

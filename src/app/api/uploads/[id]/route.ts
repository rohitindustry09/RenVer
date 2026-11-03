import { fail, ok } from "@/lib/api";
import { getUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(getUpload(id));
  } catch (error) {
    return fail(error, 404);
  }
}

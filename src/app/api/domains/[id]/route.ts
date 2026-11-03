import { failFrom, ok } from "@/lib/api";
import { removeDomain } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    removeDomain(id);
    return ok({ deleted: id });
  } catch (error) {
    return failFrom(error);
  }
}

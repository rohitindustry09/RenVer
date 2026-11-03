import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { removeDomain } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    removeDomain(id);
    return ok({ deleted: id });
  } catch (error) {
    return failFrom(error);
  }
}

export const DELETE = audited("domain.remove", handleDELETE);

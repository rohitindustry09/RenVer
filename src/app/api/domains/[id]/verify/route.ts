import { failFrom, ok } from "@/lib/api";
import { verifyDomain } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Looks up the ownership TXT record. Safe to press repeatedly while DNS catches up. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await verifyDomain(id));
  } catch (error) {
    return failFrom(error);
  }
}

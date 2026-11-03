import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { verifyDomain } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Looks up the ownership TXT record. Safe to press repeatedly while DNS catches up. */
async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await verifyDomain(id));
  } catch (error) {
    return failFrom(error);
  }
}

export const POST = audited("domain.verify", handlePOST);

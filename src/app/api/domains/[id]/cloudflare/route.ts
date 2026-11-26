import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { cloudflare } from "@/lib/cloudflare-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proves ownership through Cloudflare and serves this domain's addresses through the tunnel. */
async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { errors } = await cloudflare().connectDomain(id);
    return ok({ connected: true, problems: errors });
  } catch (error) {
    return failFrom(error);
  }
}

export const POST = audited("domain.cloudflare", handlePOST);

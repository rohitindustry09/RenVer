import { ok } from "@/lib/api";
import { DomainError, planProjectHost } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets forms show "available", "in use" or "invalid" while someone is still typing. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const { host } = planProjectHost(params.get("domainId") ?? "", params.get("label") ?? "");
    return ok({ available: true, host, reason: null });
  } catch (error) {
    if (error instanceof DomainError) return ok({ available: false, host: null, reason: error.message });
    throw error;
  }
}

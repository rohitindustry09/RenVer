import { fail, failFrom, ok } from "@/lib/api";
import { getDomain } from "@/lib/db";
import { checkDomainDns } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Checks that the domain and its subdomains point at this server. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const domain = getDomain((await params).id);
    if (!domain) return fail("Domain not found.", 404);
    return ok(await checkDomainDns(domain));
  } catch (error) {
    return failFrom(error, 500);
  }
}

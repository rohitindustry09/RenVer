import { ok } from "@/lib/api";
import { listAllDeploys } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Newest deployments across all projects. `?limit=5` gives a short list for the Overview. */
export async function GET(request: Request) {
  const asked = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;
  return ok(listAllDeploys(limit));
}

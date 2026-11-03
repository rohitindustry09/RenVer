import { ok } from "@/lib/api";
import { collectUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(collectUsage());
}

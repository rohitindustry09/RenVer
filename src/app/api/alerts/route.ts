import { ok } from "@/lib/api";
import { collectAlerts } from "@/lib/alerts-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(collectAlerts());
}

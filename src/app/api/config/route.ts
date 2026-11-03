import { ok } from "@/lib/api";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ baseDomain: config.baseDomain, mode: config.mode });
}

import { ok } from "@/lib/api";
import { readPanelLog } from "@/lib/panel-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the panel itself printed. `?offset=-1` (the default) gives the latest part; later calls pass the returned `next`. */
export async function GET(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("offset") ?? -1);
  return ok(readPanelLog(Number.isFinite(raw) ? Math.trunc(raw) : -1));
}

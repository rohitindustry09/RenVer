import { fail, ok } from "@/lib/api";
import { collectLiveUsage } from "@/lib/live-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live memory of each app, what each holds on disk, and server totals. Asks Docker, so it is polled gently. */
export async function GET() {
  try {
    return ok(await collectLiveUsage());
  } catch (error) {
    return fail(error, 500);
  }
}

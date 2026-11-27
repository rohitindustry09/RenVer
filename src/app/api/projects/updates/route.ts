import { ok } from "@/lib/api";
import { freshOrStale } from "@/lib/fresh-or-stale";
import { projectWatcher } from "@/lib/project-watch-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_WAIT_MS = 1_500;
const FORCED_WAIT_MS = 10_000;

/**
 * For each project imported from GitHub: is there a newer commit on its branch than the one deployed? The pages ask every 30
 * seconds; `?force=1` is a "Check now". Each repository is looked up once, however many projects use it.
 */
export async function GET(request: Request) {
  const watcher = projectWatcher();
  const isForced = new URL(request.url).searchParams.get("force") === "1";
  return ok(await freshOrStale(() => watcher.check(isForced), () => watcher.last(), isForced ? FORCED_WAIT_MS : POLL_WAIT_MS));
}

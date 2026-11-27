import { ok } from "@/lib/api";
import { freshOrStale } from "@/lib/fresh-or-stale";
import { updateChecker } from "@/lib/update-check-live";
import { updateJob } from "@/lib/update-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_WAIT_MS = 1_500;
const FORCED_WAIT_MS = 10_000;

/**
 * Whether GitHub has a newer RenVer, and which commits. The page asks every 30 seconds; `?force=1` is the "Check now" button.
 * While an update is running git is busy, so the last answer is returned instead of touching the repository.
 */
export async function GET(request: Request) {
  const checker = updateChecker();
  const status = updateJob().state().status;
  if (status === "running" || status === "restarting") return ok(checker.last());
  const isForced = new URL(request.url).searchParams.get("force") === "1";
  // A "Check now" may wait a little for GitHub; the page's own polling never does (it gets the last answer at once).
  return ok(await freshOrStale(() => checker.check(isForced), () => checker.last(), isForced ? FORCED_WAIT_MS : POLL_WAIT_MS));
}

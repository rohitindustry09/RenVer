import { ok } from "@/lib/api";
import { updateChecker } from "@/lib/update-check-live";
import { updateJob } from "@/lib/update-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether GitHub has a newer RenVer, and which commits. The page asks every 30 seconds; `?force=1` is the "Check now" button.
 * While an update is running git is busy, so the last answer is returned instead of touching the repository.
 */
export async function GET(request: Request) {
  const checker = updateChecker();
  const status = updateJob().state().status;
  if (status === "running" || status === "restarting") return ok(checker.last());
  return ok(await checker.check(new URL(request.url).searchParams.get("force") === "1"));
}

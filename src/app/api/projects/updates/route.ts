import { ok } from "@/lib/api";
import { projectWatcher } from "@/lib/project-watch-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * For each project imported from GitHub: is there a newer commit on its branch than the one deployed? The pages ask every 30
 * seconds; `?force=1` is a "Check now". Each repository is looked up once, however many projects use it.
 */
export async function GET(request: Request) {
  return ok(await projectWatcher().check(new URL(request.url).searchParams.get("force") === "1"));
}

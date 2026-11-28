import { audited } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { diagnoseDockerNow } from "@/lib/docker-doctor-live";
import { isDockerRunning, restartDocker, startDocker } from "@/lib/docker-start";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Without parameters: whether Docker answers right now (the quick check the Setup page repeats while Docker starts).
 * With `?diagnose=1`: every step checked and what to do about it, for the Docker doctor on the Setup page.
 */
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("diagnose") === "1") {
    const diagnosis = await diagnoseDockerNow();
    return ok({ running: diagnosis.state === "running", diagnosis });
  }
  return ok({ running: await isDockerRunning() });
}

/** Starts Docker (Docker Desktop on Windows and macOS, the service on Linux). The Setup page then watches until it answers. */
async function handlePOST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const outcome = body.action === "restart" ? await restartDocker() : await startDocker();
  return outcome.ok ? ok({ message: outcome.message }, 202) : fail(outcome.error, 400);
}

export const POST = audited("system.docker-start", handlePOST, { detail: (b) => (b.action === "restart" ? "restart" : "start") });

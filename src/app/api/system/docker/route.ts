import { audited } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { isDockerRunning, startDocker } from "@/lib/docker-start";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether Docker answers right now: the quick check the Setup page repeats while Docker is starting. */
export async function GET() {
  return ok({ running: await isDockerRunning() });
}

/** Starts Docker (Docker Desktop on Windows and macOS, the service on Linux). The Setup page then watches until it answers. */
async function handlePOST() {
  const outcome = await startDocker();
  return outcome.ok ? ok({ message: outcome.message }, 202) : fail(outcome.error, 400);
}

export const POST = audited("system.docker-start", handlePOST);

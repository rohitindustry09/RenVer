import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { readLog } from "@/lib/logs";
import { UpdateError } from "@/lib/update-job";
import { UPDATE_LOG, updateJob } from "@/lib/update-live";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The version now running: the short commit and its first line. Only asked for on request, as it starts a process. */
function currentVersion(): Promise<{ commit: string; subject: string } | null> {
  return new Promise((done) => {
    const child = spawn("git", ["log", "-1", "--format=%h%n%s"], { cwd: process.cwd(), windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => void (out += chunk.toString("utf8")));
    child.on("error", () => done(null));
    child.on("close", (code) => {
      const [commit, ...rest] = out.trim().split("\n");
      done(code === 0 && commit ? { commit, subject: rest.join(" ") } : null);
    });
  });
}

/** `?offset=N` returns the update log from that byte on; `?version=1` also returns the running version. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  return ok({
    state: updateJob().state(),
    supervised: process.env.RENVER_SUPERVISED === "1",
    version: params.get("version") === "1" ? await currentVersion() : undefined,
    log: readLog(UPDATE_LOG, offset),
  });
}

/** Body: `{ "force": true }` builds even when GitHub has nothing new. Returns at once; follow the log with GET. */
async function handlePOST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { force?: unknown };
    const job = updateJob();
    if (job.isRunning() || job.state().status === "restarting") throw new UpdateError("An update is already running.");
    void job.start({ force: body.force === true });
    return ok({ started: true }, 202);
  } catch (error) {
    return failFrom(error);
  }
}

export const POST = audited("system.update", handlePOST);

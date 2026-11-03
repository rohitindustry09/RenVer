import { audited } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { installLogId, installStatus, startInstall } from "@/lib/install-jobs";
import { isInstallableTool } from "@/lib/installer";
import { readLog } from "@/lib/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT_UID = 0;

function isAdmin(): boolean {
  return typeof process.getuid === "function" ? process.getuid() === ROOT_UID : true;
}

async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as { tool?: unknown };
    const tool = typeof body.tool === "string" ? body.tool : "";
    if (!isInstallableTool(tool)) return fail("Unknown tool.");
    const result = startInstall(tool, process.platform, isAdmin());
    return result.ok ? ok({ tool, logId: result.logId }, 202) : fail(result.error, result.status);
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tool = params.get("tool") ?? "";
  if (!isInstallableTool(tool)) return fail("Unknown tool.");
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  return ok({ status: installStatus(tool), log: readLog(installLogId(tool), offset) });
}

export const POST = audited("system.install", handlePOST);

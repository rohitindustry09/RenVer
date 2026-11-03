import { failFrom, ok } from "@/lib/api";
import { getProject } from "@/lib/db";
import { allowsFraming } from "@/lib/framing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 4000;

/** Whether the running app can be shown as a small live preview, or forbids being framed. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const project = getProject((await params).id);
    if (!project) return failFrom(Object.assign(new Error("Project not found."), { status: 404 }));
    if (project.status !== "running" || !project.hostPort) return ok({ canPreview: false });
    try {
      const response = await fetch(`http://127.0.0.1:${project.hostPort}/`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      await response.body?.cancel();
      return ok({ canPreview: allowsFraming(response.headers) });
    } catch {
      return ok({ canPreview: false });
    }
  } catch (error) {
    return failFrom(error, 500);
  }
}

import { failFrom, ok } from "@/lib/api";
import { getProject } from "@/lib/db";
import { dockerStats } from "@/lib/docker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current CPU and memory use. `stats` is null when the app is not running. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const project = getProject((await params).id);
    if (!project) return failFrom(Object.assign(new Error("Project not found."), { status: 404 }));
    const stats = project.container && project.status === "running" ? await dockerStats(project.container) : null;
    return ok({ stats });
  } catch (error) {
    return failFrom(error, 500);
  }
}

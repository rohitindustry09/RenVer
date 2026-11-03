import { failFrom, ok } from "@/lib/api";
import { getProject } from "@/lib/db";
import { dockerLogsTail } from "@/lib/docker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LINES = 200;
const MAX_LINES = 2000;

/** The last lines the running app wrote. `?lines=500` asks for more (up to 2000). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const project = getProject((await params).id);
    if (!project) return failFrom(Object.assign(new Error("Project not found."), { status: 404 }));
    if (!project.container) return ok({ lines: [] as string[], container: null });
    const asked = Number(new URL(request.url).searchParams.get("lines"));
    const lines = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LINES) : DEFAULT_LINES;
    return ok({ lines: await dockerLogsTail(project.container, lines), container: project.container });
  } catch (error) {
    return failFrom(error, 500);
  }
}

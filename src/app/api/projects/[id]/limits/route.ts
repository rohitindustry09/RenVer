import os from "node:os";
import { failFrom, ok } from "@/lib/api";
import { getProject, updateProjectLimits } from "@/lib/db";
import { dockerUpdateLimits } from "@/lib/docker";
import { effectiveLimits, validateProjectLimits } from "@/lib/limits";
import { getLimits } from "@/lib/runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sets this project's own memory and CPU. A blank field goes back to the global limit. Applies to the running app too. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const project = getProject((await params).id);
    if (!project) return failFrom(Object.assign(new Error("Project not found."), { status: 404 }));
    const body = (await request.json()) as Record<string, unknown>;
    const checked = validateProjectLimits({ memory: String(body.memory ?? ""), cpus: String(body.cpus ?? "") }, os.availableParallelism());
    if (!checked.ok) return failFrom(Object.values(checked.errors).join(" "), 400);

    updateProjectLimits(project.id, checked.value);
    const effective = effectiveLimits(getLimits(), checked.value);
    let applied = false;
    if (project.status === "running" && project.container) {
      await dockerUpdateLimits(project.container, effective.memory, effective.cpus);
      applied = true;
    }
    return ok({ limits: checked.value, effective, applied });
  } catch (error) {
    return failFrom(error, 500);
  }
}

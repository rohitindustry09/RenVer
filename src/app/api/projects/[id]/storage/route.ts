import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { getProject, updateProjectStorage } from "@/lib/db";
import { dockerRemoveVolume } from "@/lib/docker";
import { validateStoragePaths } from "@/lib/storage";
import { volumeName } from "@/lib/volume-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Body: `{ "paths": ["/data"] }`. The folders keep their files across deploys; it takes effect on the next deploy. */
async function handlePUT(request: Request, { params }: Context) {
  try {
    const project = getProject((await params).id);
    if (!project) return failFrom(Object.assign(new Error("Project not found."), { status: 404 }));
    const body = (await request.json()) as { paths?: unknown };
    const checked = validateStoragePaths(Array.isArray(body.paths) ? body.paths.map(String) : String(body.paths ?? ""));
    if (!checked.ok) return failFrom(checked.error, 400);

    // A folder that is no longer listed loses its saved files, but only once nothing can still be using it.
    const dropped = (project.config.storage ?? []).filter((p) => !checked.value.includes(p));
    updateProjectStorage(project.id, checked.value);
    if (project.status !== "running") {
      for (const path of dropped) await dockerRemoveVolume(volumeName(project.id, path)).catch(() => undefined);
    }
    return ok({ paths: checked.value, needsRedeploy: true });
  } catch (error) {
    return failFrom(error, 500);
  }
}

export const PUT = audited("project.storage", handlePUT, { detail: (b) => (Array.isArray(b.paths) ? b.paths.join(", ") : String(b.paths ?? "")) });

import { fail, ok, publicProject } from "@/lib/api";
import { deleteProject, getProject, listDeploys, listProjectHosts } from "@/lib/db";
import { removeRelease, syncProxy } from "@/lib/deploy";
import { forgetWebhookSecret } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return fail("Project not found.", 404);
  return ok({
    project: publicProject(project),
    deploys: listDeploys(id),
    hosts: listProjectHosts(id).map((h) => h.host),
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return fail("Project not found.", 404);
    if (project.status === "deploying") return fail("A deploy is in progress. Try again when it finishes.", 409);
    if (project.container) await removeRelease(project.container);
    deleteProject(id);
    forgetWebhookSecret(id);
    await syncProxy(() => undefined);
    return ok({ deleted: id });
  } catch (error) {
    return fail(error, 500);
  }
}

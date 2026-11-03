import { audited } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { createDeploy, getProject } from "@/lib/db";
import { runDeploy } from "@/lib/deploy";
import { enqueue } from "@/lib/queue";
import { sourceDirFor } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return fail("Project not found.", 404);
    if (project.status === "deploying") return fail("A deploy is already in progress.", 409);
    const body = (await request.json()) as Record<string, unknown>;
    const sourceDir = sourceDirFor(String(body.uploadId ?? ""));
    const deploy = createDeploy(project.id, String(body.uploadId));
    enqueue(() => runDeploy(project.id, deploy.id, sourceDir));
    return ok({ deployId: deploy.id }, 202);
  } catch (error) {
    return fail(error);
  }
}

export const POST = audited("project.deploy", handlePOST);

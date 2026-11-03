import { audited } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { getProject } from "@/lib/db";
import { deployFromPush, githubSourceFor } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fetches the newest code from the project's GitHub repository and deploys it. Redeploy, by contrast, rebuilds the saved copy. */
async function handlePOST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return fail("Project not found.", 404);
    if (project.status === "deploying") return fail("A deploy is already in progress.", 409);
    if (!githubSourceFor(id)) return fail("This project was not imported from GitHub.", 409);
    return ok(await deployFromPush(id), 202);
  } catch (error) {
    return fail(error);
  }
}

export const POST = audited("project.pull", handlePOST);

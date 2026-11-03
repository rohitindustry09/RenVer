import { failFrom, ok } from "@/lib/api";
import { getProject } from "@/lib/db";
import { githubSourceFor, webhookSecretFor } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What to paste into GitHub's webhook settings. The secret stays behind the panel login. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getProject(id)) return failFrom(Object.assign(new Error("Project not found."), { status: 404 }));
    const source = githubSourceFor(id);
    if (!source) return ok({ isGithub: false as const });
    return ok({ isGithub: true as const, repo: source.repo, branch: source.branch, path: `/api/webhooks/github/${id}`, secret: webhookSecretFor(id) });
  } catch (error) {
    return failFrom(error, 500);
  }
}

import { audited } from "@/lib/audited";
import { fail, failFrom, ok } from "@/lib/api";
import { getProject } from "@/lib/db";
import { setWantsShare } from "@/lib/tunnel-share";
import { TunnelError, tunnels } from "@/lib/tunnels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The temporary public address for this project, or `{ url: null }` when it is not shared. */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!getProject(id)) return fail("Project not found.", 404);
  return ok({ url: tunnels().get(id)?.url ?? null });
}

/** Shares the running project through a Cloudflare quick tunnel. */
async function handlePOST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return fail("Project not found.", 404);
    if (project.status !== "running" || project.hostPort === null) {
      throw new TunnelError("The project must be running before it can be shared.", 409);
    }
    const url = await tunnels().start(id, project.hostPort);
    setWantsShare(id, true);
    return ok({ url });
  } catch (error) {
    return failFrom(error, 500);
  }
}

/** Stops sharing: the temporary address stops working. */
async function handleDELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  tunnels().stop(id);
  setWantsShare(id, false);
  return ok({ url: null });
}

export const POST = audited("project.share", handlePOST);
export const DELETE = audited("project.unshare", handleDELETE);

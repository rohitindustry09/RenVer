import { audited } from "@/lib/audited";
import { fail, failFrom, ok, publicProject } from "@/lib/api";
import { config } from "@/lib/config";
import { serverAddresses } from "@/lib/domains";
import { deleteProject, getProject, listDeploys, listProjectHosts, updateProjectName } from "@/lib/db";
import { validateProjectName } from "@/lib/project-name";
import { removeRelease, syncProxy } from "@/lib/deploy";
import { dockerRemoveNetwork, dockerRemoveVolume } from "@/lib/docker";
import { tunnels } from "@/lib/tunnels";
import { setWantsShare } from "@/lib/tunnel-share";
import { volumeName } from "@/lib/volume-name";
import { appNetworkName } from "@/lib/network-names";
import { readUploadSource } from "@/lib/uploads";
import { forgetWebhookSecret, githubSourceFor } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Where a deployment's code came from (and for GitHub, which commit), or null when that was not saved. */
function deploySource(uploadId: string | null) {
  const meta = uploadId ? readUploadSource(uploadId) : null;
  return meta ? { source: meta.source, label: meta.label, branch: meta.branch, commit: meta.commit ?? null, message: meta.message ?? null } : null;
}

/** http://<server ip>:<port> when apps are published on the server's IP (RENVER_PUBLISH_APPS), else null. */
function directUrlFor(hostPort: number | null): string | null {
  const ip = serverAddresses()[0];
  return config.publishApps && hostPort && ip ? `http://${ip}:${hostPort}` : null;
}

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return fail("Project not found.", 404);
  return ok({
    project: publicProject(project),
    deploys: listDeploys(id).map((d) => ({ ...d, source: deploySource(d.uploadId) })),
    hosts: listProjectHosts(id).map((h) => h.host),
    directUrl: directUrlFor(project.hostPort),
    github: githubSourceFor(id),
  });
}

/** Body: `{ "name": "New name" }`. Only the shown name changes; the address, containers and data stay as they are. */
async function handlePATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return fail("Project not found.", 404);
    const body = (await request.json()) as { name?: unknown };
    const checked = validateProjectName(typeof body.name === "string" ? body.name : "");
    if (!checked.ok) return fail(checked.error, 400);
    updateProjectName(id, checked.value);
    return ok({ name: checked.value });
  } catch (error) {
    return failFrom(error);
  }
}

async function handleDELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return fail("Project not found.", 404);
    if (project.status === "deploying") return fail("A deploy is in progress. Try again when it finishes.", 409);
    tunnels().stop(id);
    setWantsShare(id, false);
    if (project.container) await removeRelease(project.container);
    await dockerRemoveNetwork(appNetworkName(id)).catch(() => undefined);
    for (const path of project.config.storage ?? []) await dockerRemoveVolume(volumeName(id, path)).catch(() => undefined);
    deleteProject(id);
    forgetWebhookSecret(id);
    await syncProxy(() => undefined);
    return ok({ deleted: id });
  } catch (error) {
    return fail(error, 500);
  }
}

export const DELETE = audited("project.delete", handleDELETE);

export const PATCH = audited("project.rename", handlePATCH, { detail: (b) => (typeof b.name === "string" ? b.name.slice(0, 80) : undefined) });

import { audited } from "@/lib/audited";
import { fail, ok, publicProject } from "@/lib/api";
import { config } from "@/lib/config";
import { serverAddresses } from "@/lib/domains";
import { deleteProject, getProject, listDeploys, listProjectHosts } from "@/lib/db";
import { removeRelease, syncProxy } from "@/lib/deploy";
import { dockerRemoveNetwork, dockerRemoveVolume } from "@/lib/docker";
import { volumeName } from "@/lib/volume-name";
import { appNetworkName } from "@/lib/network-names";
import { forgetWebhookSecret, githubSourceFor } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

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
    deploys: listDeploys(id),
    hosts: listProjectHosts(id).map((h) => h.host),
    directUrl: directUrlFor(project.hostPort),
    github: githubSourceFor(id),
  });
}

async function handleDELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) return fail("Project not found.", 404);
    if (project.status === "deploying") return fail("A deploy is in progress. Try again when it finishes.", 409);
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

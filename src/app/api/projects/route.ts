import { failFrom, ok, publicProject } from "@/lib/api";
import { createDeploy, createProject } from "@/lib/db";
import { listProjectItems } from "@/lib/project-list";
import { runDeploy } from "@/lib/deploy";
import { detectProject } from "@/lib/detect";
import { DomainError, planProjectHost, uniqueSlug } from "@/lib/domains";
import { enqueue } from "@/lib/queue";
import { encryptEnv } from "@/lib/secrets";
import { directoryFiles, sourceDirFor } from "@/lib/uploads";
import { parseEnv, parseProjectConfig } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 80;

export async function GET() {
  return ok(listProjectItems());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { domain, host } = planProjectHost(String(body.domainId ?? ""), typeof body.label === "string" ? body.label : "");

    const name = String(body.name ?? host).trim().slice(0, MAX_NAME_LENGTH) || host;
    const sourceDir = sourceDirFor(String(body.uploadId ?? ""));
    const detection = detectProject(directoryFiles(sourceDir));
    const projectConfig = parseProjectConfig(body.config, detection);
    const envEncrypted = encryptEnv(parseEnv(body.env));

    let project;
    try {
      project = createProject({
        name,
        subdomain: uniqueSlug(host),
        primaryHost: host,
        domainId: domain.id,
        config: projectConfig,
        envEncrypted,
      });
    } catch (error) {
      // Two requests for the same address at once: the database's UNIQUE rule decides who wins.
      if (error instanceof Error && /UNIQUE/i.test(error.message)) throw new DomainError(`${host} is already in use.`, 409);
      throw error;
    }

    const deploy = createDeploy(project.id, String(body.uploadId));
    void enqueue(() => runDeploy(project.id, deploy.id, sourceDir));
    return ok({ project: publicProject(project), deployId: deploy.id }, 202);
  } catch (error) {
    return failFrom(error);
  }
}

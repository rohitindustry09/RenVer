import { randomBytes } from "node:crypto";
import { createDeploy, getProject, getSetting, latestUploadId, setSetting } from "./db";
import { runDeploy } from "./deploy";
import { importFromGithub } from "./github";
import { enqueue } from "./queue";
import { decryptEnv, encryptEnv } from "./secrets";
import { readUploadSource, sourceDirFor } from "./uploads";

const SECRET_BYTES = 24;
const secretKey = (projectId: string): string => `webhook-secret:${projectId}`;

/** The secret GitHub signs this project's push events with. It is created the first time it is asked for. */
export function webhookSecretFor(projectId: string): string {
  const stored = getSetting(secretKey(projectId));
  const existing = stored ? decryptEnv(stored).secret : undefined;
  if (existing) return existing;
  const secret = randomBytes(SECRET_BYTES).toString("hex");
  setSetting(secretKey(projectId), encryptEnv({ secret }));
  return secret;
}

export function forgetWebhookSecret(projectId: string): void {
  setSetting(secretKey(projectId), null);
}

/** The repository and branch a project was last imported from, or null if it came from a zip file. */
export function githubSourceFor(projectId: string): { repo: string; branch: string | null } | null {
  const uploadId = latestUploadId(projectId);
  const source = uploadId ? readUploadSource(uploadId) : null;
  return source?.source === "github" ? { repo: source.label, branch: source.branch } : null;
}

/** Fetches the latest code from GitHub and deploys it. Builds run one after another, so a push during a build is queued. */
export async function deployFromPush(projectId: string): Promise<{ deployId: string }> {
  const project = getProject(projectId);
  const source = githubSourceFor(projectId);
  if (!project || !source) throw new Error("This project was not imported from GitHub.");
  const upload = await importFromGithub({ url: `https://github.com/${source.repo}`, branch: source.branch });
  const deploy = createDeploy(projectId, upload.uploadId);
  const sourceDir = sourceDirFor(upload.uploadId);
  void enqueue(() => runDeploy(projectId, deploy.id, sourceDir));
  return { deployId: deploy.id };
}

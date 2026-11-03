import { createDeploy, getDeploy, getProject, latestUploadId } from "./db";
import { runDeploy } from "./deploy";
import { enqueue } from "./queue";
import { sourceDirFor } from "./uploads";

export class RedeployError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The saved source to build: that of an earlier deployment when rolling back, otherwise the latest one. */
function uploadFor(projectId: string, fromDeployId: string | undefined): string {
  if (fromDeployId === undefined) {
    const latest = latestUploadId(projectId);
    if (!latest) throw new RedeployError("No saved source for this project. Import it again from New Project.", 409);
    return latest;
  }
  const earlier = getDeploy(fromDeployId);
  if (!earlier || earlier.projectId !== projectId) throw new RedeployError("That deployment does not belong to this project.", 404);
  if (!earlier.uploadId) throw new RedeployError("That deployment has no saved source to build from.", 409);
  return earlier.uploadId;
}

/**
 * Deploys the project again, for example after its environment changed.
 * Give `fromDeployId` to roll back: the project is rebuilt from that earlier deployment's source.
 */
export function startRedeploy(projectId: string, fromDeployId?: string): { deployId: string } {
  const project = getProject(projectId);
  if (!project) throw new RedeployError("Project not found.", 404);
  if (project.status === "deploying") throw new RedeployError("A deploy is already in progress.", 409);

  const uploadId = uploadFor(projectId, fromDeployId);
  let sourceDir: string;
  try {
    sourceDir = sourceDirFor(uploadId);
  } catch {
    throw new RedeployError("The saved source for that deployment is gone. Import the project again from New Project.", 409);
  }

  const deploy = createDeploy(projectId, uploadId);
  void enqueue(() => runDeploy(projectId, deploy.id, sourceDir));
  return { deployId: deploy.id };
}

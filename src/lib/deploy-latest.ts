import { getProject } from "./db";
import { RedeployError, startRedeploy } from "./redeploy";
import { deployFromPush, githubSourceFor } from "./webhooks";

export interface LatestDeploy {
  deployId: string;
  /** True when the newest code was fetched from GitHub; false when the saved copy was rebuilt. */
  pulled: boolean;
  /** Why the newest code could not be fetched, when a GitHub project fell back to its saved copy. */
  note: string | null;
}

/**
 * Deploys a project with the newest code. A project imported from GitHub is pulled first (like the Pull latest button);
 * if that fails (GitHub unreachable, token missing), it is rebuilt from its saved copy instead and the reason is returned,
 * so the deploy still happens. Other projects are rebuilt from their saved source.
 */
export async function deployLatest(projectId: string): Promise<LatestDeploy> {
  const project = getProject(projectId);
  if (!project) throw new RedeployError("Project not found.", 404);
  if (project.status === "deploying") throw new RedeployError("A deploy is already in progress.", 409);

  if (githubSourceFor(projectId)) {
    try {
      const started = await deployFromPush(projectId);
      return { deployId: started.deployId, pulled: true, note: null };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      const fallback = startRedeploy(projectId);
      return { deployId: fallback.deployId, pulled: false, note: `Could not pull the latest code (${reason}), so the saved version was rebuilt.` };
    }
  }
  return { deployId: startRedeploy(projectId).deployId, pulled: false, note: null };
}

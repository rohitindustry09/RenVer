import { getProject, updateProject, type Project } from "./db";
import { syncProxy } from "./deploy";
import { dockerContainerExists, dockerRestart, dockerStart, dockerStop, waitHealthy } from "./docker";
import { POWER_ACTIONS, type PowerAction } from "./power-actions";
import { startRedeploy } from "./redeploy";

export { POWER_ACTIONS, type PowerAction };

export class PowerError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function runnable(projectId: string): Project & { container: string } {
  const project = getProject(projectId);
  if (!project) throw new PowerError("Project not found.", 404);
  if (project.status === "deploying") throw new PowerError("A deploy is in progress. Try again when it finishes.", 409);
  if (!project.container) throw new PowerError("This project has no running version yet. Deploy it first.", 409);
  return project as Project & { container: string };
}

/**
 * Pauses, resumes or restarts a project's container and keeps the proxy and the stored status in step.
 * A paused project uses no CPU or memory and its addresses stop answering; the watchdog leaves it alone.
 */
export async function setProjectPower(projectId: string, action: PowerAction): Promise<{ deployId?: string }> {
  const project = runnable(projectId);
  if (action === "pause") {
    if (project.status === "paused") return {};
    await dockerStop(project.container);
    updateProject(projectId, { status: "paused" });
  } else {
    if (action === "resume") {
      if (project.status === "running") return {};
      // After a restore onto another machine the container is gone: build the app again from its saved source.
      if (!(await dockerContainerExists(project.container))) return startRedeploy(projectId);
      await dockerStart(project.container);
    } else {
      await dockerRestart(project.container);
    }
    if (project.hostPort) await waitHealthy(project.hostPort);
    updateProject(projectId, { status: "running" });
  }
  await syncProxy(() => undefined);
  return {};
}

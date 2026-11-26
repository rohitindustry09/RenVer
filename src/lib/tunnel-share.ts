import { getSetting, setSetting } from "./db";
import { tunnels } from "./tunnels";

const key = (projectId: string): string => `share:${projectId}`;

/** Whether the owner asked for this project to be reachable on a temporary Cloudflare address. */
export function wantsShare(projectId: string): boolean {
  return getSetting(key(projectId)) === "1";
}

export function setWantsShare(projectId: string, wanted: boolean): void {
  setSetting(key(projectId), wanted ? "1" : null);
}

/**
 * Called after a deploy: a new release has a new local port, so a shared project gets a fresh tunnel to it.
 * Never throws, so a missing cloudflared cannot fail a deploy that otherwise worked.
 */
export async function resumeShare(projectId: string, hostPort: number, log: (line: string) => void): Promise<void> {
  if (!wantsShare(projectId)) return;
  try {
    tunnels().stop(projectId);
    const url = await tunnels().start(projectId, hostPort);
    log(`Shared publicly at ${url}`);
  } catch (error) {
    log(`Could not share publicly: ${error instanceof Error ? error.message : String(error)}`);
  }
}

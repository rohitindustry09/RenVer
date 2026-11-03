import { api } from "./client-api";
import type { PowerAction } from "./power-actions";

/** The words shown for each power action, shared by every screen that offers it. */
export const POWER_COPY: Record<PowerAction, { title: string; message: string; button: string; busy: string; done: string }> = {
  pause: {
    title: "Pause this project?",
    message:
      "The app is stopped completely: it uses no memory or CPU and its addresses stop answering. Nothing is deleted. Resume it any time and it comes back as it was.",
    button: "Pause project",
    busy: "Pausing…",
    done: "Paused.",
  },
  resume: { title: "Resume this project?", message: "", button: "Resume project", busy: "Resuming…", done: "Resumed." },
  restart: {
    title: "Restart this app?",
    message: "The app is briefly offline while it restarts. Use this if it is stuck or after changing something outside RenVer.",
    button: "Restart",
    busy: "Restarting…",
    done: "Restarted.",
  },
};

/** `deployId` is set when resuming had to build the app again (for example after restoring onto a new machine). */
export function callPower(projectId: string, action: PowerAction): Promise<{ action: PowerAction; deployId: string | null }> {
  return api(`/api/projects/${projectId}/power`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

/** What to tell the person once an action has finished. */
export function powerDoneText(action: PowerAction, result: { deployId: string | null }): string {
  return result.deployId ? "Building it again from the saved source. It comes online when the build finishes." : POWER_COPY[action].done;
}

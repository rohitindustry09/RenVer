import { hostUrl } from "./domain-names";
import { getProject, getSetting, setSetting, type Project } from "./db";
import { decryptEnv, encryptEnv } from "./secrets";
import { installWordPress } from "./wordpress-install";

/** Steps a template project needs after its container answers, before the deploy is called live. */

type Log = (line: string) => void;

const installKey = (projectId: string): string => `wp-install:${projectId}`;

export interface PendingInstall {
  title: string;
  adminUser: string;
  adminEmail: string;
  adminPassword: string;
  language: string;
  indexable: boolean;
}

/** Keeps the admin details (encrypted) until WordPress has been set up, so a failed deploy can be retried. */
export function savePendingInstall(projectId: string, pending: PendingInstall): void {
  const encrypted = encryptEnv({ ...pending, indexable: pending.indexable ? "1" : "0" });
  if (!encrypted) throw new Error("Could not store the admin details.");
  setSetting(installKey(projectId), encrypted);
}

export function readPendingInstall(projectId: string): PendingInstall | null {
  const stored = getSetting(installKey(projectId));
  if (!stored) return null;
  const v = decryptEnv(stored);
  if (!v.title || !v.adminUser || !v.adminEmail || !v.adminPassword) return null;
  return { title: v.title, adminUser: v.adminUser, adminEmail: v.adminEmail, adminPassword: v.adminPassword, language: v.language || "en_US", indexable: v.indexable !== "0" };
}

export function clearPendingInstall(projectId: string): void {
  setSetting(installKey(projectId), null);
}

/** Runs right after a new container answers. Throws if the site could not be set up, which stops the deploy. */
export async function afterStart(project: Project, hostPort: number, log: Log): Promise<void> {
  if (project.config.template !== "wordpress") return;
  const pending = readPendingInstall(project.id);
  if (!pending) return;
  if (!getProject(project.id)) return;

  log("Setting up WordPress (title, admin account)...");
  const outcome = await installWordPress({
    port: hostPort,
    host: project.primaryHost,
    https: hostUrl(project.primaryHost).startsWith("https"),
    ...pending,
  });
  if (!outcome.ok) throw new Error(`WordPress setup failed: ${outcome.error}`);
  clearPendingInstall(project.id);
  log(outcome.alreadyInstalled ? "WordPress was already set up." : `WordPress is ready. Sign in at /wp-admin as ${pending.adminUser}.`);
}

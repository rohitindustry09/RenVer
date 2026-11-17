import fs from "node:fs";
import path from "node:path";
import { createDeploy, createProject, getDatabaseRecord, updateDeploy, type Project } from "./db";
import { createDatabase, credentialsFor } from "./databases";
import { runDeploy } from "./deploy";
import { savePendingInstall } from "./deploy-hooks";
import { planProjectHost, uniqueSlug } from "./domains";
import { enqueue } from "./queue";
import { encryptEnv } from "./secrets";
import { createUploadDir, finalizeUpload } from "./uploads";
import { WORDPRESS_DATA_DIR, WORDPRESS_PORT, wordpressDockerfile, wordpressEnv } from "./wordpress-env";
import type { WordPressInput } from "./wordpress-input";

/** Creates a whole WordPress website: its database, its project, its files and its first deploy. */

const DB_WAIT_MS = 3 * 60 * 1000;
const DB_POLL_MS = 2000;
const MAX_DB_NAME = 30;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDatabase(databaseId: string): Promise<void> {
  const deadline = Date.now() + DB_WAIT_MS;
  while (Date.now() < deadline) {
    const record = getDatabaseRecord(databaseId);
    if (!record) throw new Error("The website's database was removed.");
    if (record.status === "running") return;
    if (record.status === "failed") throw new Error(`The website's database could not start: ${record.error ?? "unknown error"}`);
    await sleep(DB_POLL_MS);
  }
  throw new Error("The website's database did not start in time.");
}

function databaseNameFor(slug: string): string {
  const base = `wp-${slug}`.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, MAX_DB_NAME).replace(/-+$/, "");
  return /^[a-z]/.test(base) ? base : `wp-${base}`.slice(0, MAX_DB_NAME);
}

export function createWordPressSite(input: WordPressInput, where: { domainId: string; label: string }): { project: Project; deployId: string } {
  const { domain, host } = planProjectHost(where.domainId, where.label);
  const slug = uniqueSlug(host);

  const database = createDatabase({ name: databaseNameFor(slug), engine: "mariadb", version: "11.4" });
  const envEncrypted = encryptEnv(wordpressEnv(credentialsFor(database)));

  const { uploadId, base } = createUploadDir();
  fs.writeFileSync(path.join(base, "Dockerfile"), wordpressDockerfile());
  finalizeUpload(uploadId, base, base, { source: "template", label: "WordPress", branch: null });

  const project = createProject({
    name: input.title,
    subdomain: slug,
    primaryHost: host,
    domainId: domain.id,
    envEncrypted,
    config: {
      framework: "dockerfile",
      stack: "wordpress",
      template: "wordpress",
      storage: [WORDPRESS_DATA_DIR],
      limits: { memory: "768m" },
      kind: "server",
      installCommand: null,
      buildCommand: null,
      startCommand: null,
      outputDir: null,
      port: WORDPRESS_PORT,
      nodeVersion: "",
      packageManager: "",
    },
  });
  savePendingInstall(project.id, input);

  const deploy = createDeploy(project.id, uploadId);
  void enqueue(async () => {
    try {
      await waitForDatabase(database.id);
    } catch (error) {
      updateDeploy(deploy.id, "failed", error instanceof Error ? error.message : String(error));
      return;
    }
    await runDeploy(project.id, deploy.id, base);
  });
  return { project, deployId: deploy.id };
}

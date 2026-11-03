import fs from "node:fs";
import path from "node:path";
import { applyCaddyConfig, buildCaddyConfig, ensureCaddyRunning } from "./caddy";
import { config } from "./config";
import { hostUrl } from "./domain-names";
import { stackOf } from "./stack";
import { pruneUploads } from "./upload-cleanup";
import {
  getProject,
  listProjectHosts,
  listRunningRoutes,
  updateDeploy,
  updateProject,
  usedHostPorts,
  type Project,
} from "./db";
import type { DetectionResult } from "./detect";
import {
  containerLogs,
  dockerBuild,
  dockerRemove,
  dockerPruneBuildCache,
  dockerRemoveImage,
  dockerRun,
  ensureNetwork,
  isPortFree,
  waitHealthy,
} from "./docker";
import { generateDockerfile } from "./dockerfile";
import { prepareAppUrls } from "./env-urls";
import { joinLinkedDatabases } from "./isolation";
import { getPanelHost } from "./panel-host";
import { appNetworkName } from "./network-names";
import { volumeName } from "./volume-name";
import { appendLog } from "./logs";
import { effectiveLimits } from "./limits";
import { getLimits } from "./runtime-settings";
import { decryptEnv } from "./secrets";

const MAX_PORT_SCAN = 500;
const CONTAINER_NAME_PATTERN = /^renver-(.+)-([0-9a-f]{8})$/;

type Log = (line: string) => void;

/** Never throws: a failing log write must not derail a deploy or its cleanup. */
function safeLog(deployId: string): Log {
  return (line) => {
    try {
      appendLog(deployId, line);
    } catch {
      /* logging is best effort */
    }
  };
}

async function allocateHostPort(): Promise<number> {
  const taken = new Set(usedHostPorts());
  const { hostPortStart } = getLimits();
  for (let port = hostPortStart; port < hostPortStart + MAX_PORT_SCAN; port++) {
    if (!taken.has(port) && (await isPortFree(port))) return port;
  }
  throw new Error("No free host port available.");
}

function toDetection(project: Project): DetectionResult {
  const c = project.config;
  return {
    framework: c.framework as DetectionResult["framework"],
    stack: stackOf(c),
    kind: c.kind,
    packageManager: c.packageManager as DetectionResult["packageManager"],
    installCommand: c.installCommand,
    buildCommand: c.buildCommand,
    startCommand: c.startCommand,
    outputDir: c.outputDir,
    port: c.port,
    nodeVersion: c.nodeVersion,
    confidence: "high",
    notes: [],
  };
}

function prepareBuildContext(project: Project, sourceDir: string, envKeys: string[]): number {
  const generated = generateDockerfile(toDetection(project), { envKeys });
  if (!generated) return project.config.port;
  fs.writeFileSync(path.join(sourceDir, "Dockerfile"), generated.dockerfile);
  for (const [name, content] of Object.entries(generated.extraFiles)) {
    fs.writeFileSync(path.join(sourceDir, name), content);
  }
  return generated.port;
}

/** Maps `renver-<sub>-<deployId>` back to its image tag `renver/<sub>:<deployId>`. */
export function imageTagFor(container: string): string | null {
  const match = CONTAINER_NAME_PATTERN.exec(container);
  return match ? `renver/${match[1]}:${match[2]}` : null;
}

export async function removeRelease(container: string): Promise<void> {
  await dockerRemove(container);
  const tag = imageTagFor(container);
  if (tag) await dockerRemoveImage(tag);
}

/** Sends every running project's route to Caddy. Returns whether Caddy accepted the config. */
export async function syncProxy(log: Log): Promise<boolean> {
  const caddyConfig = buildCaddyConfig(listRunningRoutes(), {
    panel: getPanelHost() ? { hosts: [getPanelHost() as string], port: config.panelPort } : undefined,
  });
  try {
    await ensureCaddyRunning(path.join(config.dataDir, "caddy-bootstrap.json"));
    await applyCaddyConfig(caddyConfig);
    log("Proxy updated.");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Warning: could not update Caddy (${message}). The app is still reachable on its local port.`);
    return false;
  }
}

interface Release {
  container: string;
  hostPort: number;
}

/** Builds the image, starts the new container and waits until it answers. Throws on any failure. */
async function buildAndStart(
  project: Project,
  deployId: string,
  sourceDir: string,
  log: Log,
  onStarted: (container: string) => void,
): Promise<Release> {
  const container = `renver-${project.subdomain}-${deployId}`;
  const tag = `renver/${project.subdomain}:${deployId}`;
  const prepared = prepareAppUrls(decryptEnv(project.envEncrypted), project.primaryHost);
  const env = prepared.env;
  for (const note of prepared.notes) log(note);
  const containerPort = prepareBuildContext(project, sourceDir, Object.keys(env));

  updateDeploy(deployId, "building");
  log(`Building image ${tag}`);
  await dockerBuild({ contextDir: sourceDir, tag, buildEnv: env, onLine: log });

  updateDeploy(deployId, "starting");
  const hostPort = await allocateHostPort();
  const network = appNetworkName(project.id);
  await ensureNetwork(network);
  log(`Starting container on port ${hostPort}`);
  await dockerRun({
    name: container,
    tag,
    hostPort,
    containerPort,
    projectId: project.id,
    runtimeEnv: env,
    limits: effectiveLimits(getLimits(), project.config.limits),
    network,
    volumes: (project.config.storage ?? []).map((path) => ({ name: volumeName(project.id, path), path })),
    onLine: log,
  });
  await joinLinkedDatabases(project.id, container, log);
  onStarted(container);

  log("Waiting for the app to respond...");
  await waitHealthy(hostPort);
  return { container, hostPort };
}

/** After the DB points at the new release nothing here may roll it back; failures are only logged. */
async function finishRelease(
  project: Project,
  deployId: string,
  release: Release,
  previous: string | null,
  log: Log,
): Promise<void> {
  await syncProxy(log).catch((e: unknown) => log(`Proxy sync failed: ${String(e)}`));
  if (previous && previous !== release.container) {
    await removeRelease(previous).catch((e: unknown) => log(`Could not remove old release: ${String(e)}`));
  }
  updateDeploy(deployId, "live");
  pruneUploads();
  void dockerPruneBuildCache().catch(() => undefined);
  const hosts = listProjectHosts(project.id).map((h) => hostUrl(h.host));
  log(`Live at ${hosts.join(", ")} (direct: http://127.0.0.1:${release.hostPort})`);
}

async function abandonRelease(
  projectId: string,
  deployId: string,
  container: string | null,
  previous: string | null,
  message: string,
  log: Log,
): Promise<void> {
  log(`Deploy failed: ${message}`);
  if (container) {
    await containerLogs(container, log).catch(() => undefined);
    await removeRelease(container).catch(() => undefined);
  }
  if (getProject(projectId)) {
    updateProject(projectId, { status: previous ? "running" : "failed" });
    if (previous) log("Previous version is still running.");
  }
  updateDeploy(deployId, "failed", message);
}

export async function runDeploy(projectId: string, deployId: string, sourceDir: string): Promise<void> {
  const log = safeLog(deployId);
  const project = getProject(projectId);
  if (!project) {
    updateDeploy(deployId, "failed", "Project not found");
    return;
  }

  const previous = project.container;
  let startedContainer: string | null = null;
  let release: Release;

  try {
    updateProject(projectId, { status: "deploying" });
    release = await buildAndStart(project, deployId, sourceDir, log, (name) => {
      startedContainer = name;
    });
    if (!getProject(projectId)) throw new Error("Project was deleted while it was deploying.");
    updateProject(projectId, { status: "running", container: release.container, hostPort: release.hostPort });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await abandonRelease(projectId, deployId, startedContainer, previous, message, log);
    return;
  }

  await finishRelease(project, deployId, release, previous, log);
}

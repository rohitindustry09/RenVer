import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config";
import type { DockerDf } from "./cleanup";
import { listDatabaseRecords, listDeployUploadRefs, listProjects } from "./db";
import { directoryStats } from "./dir-stats";
import { readDockerDf, realDocker, type DockerRunner } from "./docker-df";
import { parseDockerSize } from "./cleanup";
import { parseDockerStats, type ContainerStats } from "./docker-stats";
import { imageTagFor } from "./image-tag";
import { reservedMemory } from "./reserved-memory";
import { getLimits } from "./runtime-settings";
import { volumeName } from "./volume-name";

const BYTES_PER_MB = 1024 * 1024;
const STATS_CACHE_MS = 3_000;
const DF_CACHE_MS = 60_000;
const SOURCE_CACHE_MS = 5 * 60_000;
const MAX_NEW_SOURCE_SCANS = 6;
const STATS_TIMEOUT_MS = 30_000;

export interface LiveProject {
  /** What the app is using now and the most it may use. Null when it is not running. */
  memory: { usedMB: number; limitMB: number } | null;
  /** Disk the project holds on the server. Null when Docker could not say. */
  disk: { bytes: number; image: number; writable: number; volumes: number; sources: number } | null;
}

export interface LiveUsage {
  at: string;
  server: { memoryTotalMB: number; memoryUsedMB: number; diskTotalBytes: number; diskFreeBytes: number };
  memory: { reservedAppsMB: number; reservedDatabasesMB: number; usedAppsMB: number; usedDatabasesMB: number };
  projects: Record<string, LiveProject>;
}

/** Reads `name|cpu%|used / limit` lines (docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"). */
export function parseStatsLines(text: string): Map<string, ContainerStats> {
  const byName = new Map<string, ContainerStats>();
  for (const line of text.split(/\r?\n/)) {
    const bar = line.indexOf("|");
    if (bar <= 0) continue;
    const stats = parseDockerStats(line.slice(bar + 1));
    if (stats) byName.set(line.slice(0, bar).trim(), stats);
  }
  return byName;
}

/** Reads `repository|tag|size` lines (docker image ls --format "{{.Repository}}|{{.Tag}}|{{.Size}}") into sizes by "repository:tag". */
export function parseImageSizes(text: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const [repository, tag, size] = line.split("|");
    if (repository && tag && size) sizes.set(`${repository}:${tag}`, parseDockerSize(size));
  }
  return sizes;
}

/** Total and used memory of the server from /proc/meminfo, where "available" counts cache the system can give back. */
export function parseMeminfo(text: string): { totalMB: number; usedMB: number } | null {
  const kb = (key: string): number | null => {
    const match = new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, "m").exec(text);
    return match ? Number(match[1]) : null;
  };
  const total = kb("MemTotal");
  const available = kb("MemAvailable");
  if (total === null || available === null) return null;
  return { totalMB: Math.round(total / 1024), usedMB: Math.round((total - available) / 1024) };
}

function serverMemory(): { totalMB: number; usedMB: number } {
  try {
    const parsed = parseMeminfo(fs.readFileSync("/proc/meminfo", "utf8"));
    if (parsed) return parsed;
  } catch {
    /* not Linux */
  }
  const total = os.totalmem();
  return { totalMB: Math.round(total / BYTES_PER_MB), usedMB: Math.round((total - os.freemem()) / BYTES_PER_MB) };
}

/** What one project holds on disk: its image, its container's writable layer, its saved folders and its saved source copies. */
export function projectDisk(
  project: { id: string; container: string | null; config: { storage?: string[] } },
  df: DockerDf,
  sourceBytes: number,
  imageSizes: ReadonlyMap<string, number> = new Map(),
): NonNullable<LiveProject["disk"]> {
  const tag = project.container ? imageTagFor(project.container) : null;
  // `docker image ls` lists every tag; `system df` lists an image once even when several tags share it.
  const image = tag ? (imageSizes.get(tag) ?? df.images.find((i) => `${i.repository}:${i.tag}` === tag)?.fullBytes ?? 0) : 0;
  const writable = project.container ? (df.containers.find((c) => c.name === project.container)?.bytes ?? 0) : 0;
  const wanted = new Set((project.config.storage ?? []).map((p) => volumeName(project.id, p)));
  const volumes = df.volumes.filter((v) => wanted.has(v.name)).reduce((total, v) => total + v.bytes, 0);
  return { bytes: image + writable + volumes + sourceBytes, image, writable, volumes, sources: sourceBytes };
}

interface Cache {
  stats?: { at: number; value: Map<string, ContainerStats> };
  df?: { at: number; value: DockerDf };
  images?: { at: number; value: Map<string, number> };
  sources: Map<string, { at: number; bytes: number }>;
  pending?: Promise<LiveUsage>;
}

const globalCache = globalThis as typeof globalThis & { __renverLive?: Cache };
const cache = (): Cache => (globalCache.__renverLive ??= { sources: new Map() });

/** Sizes of the saved source copies, reused for a few minutes, with a limit on how many new folders one call may walk. */
function sourceBytesByProject(now: number): Map<string, number> {
  const store = cache().sources;
  const perProject = new Map<string, Set<string>>();
  for (const ref of listDeployUploadRefs()) {
    if (!ref.uploadId) continue;
    if (!perProject.has(ref.projectId)) perProject.set(ref.projectId, new Set());
    perProject.get(ref.projectId)!.add(ref.uploadId);
  }
  let fresh = 0;
  const totals = new Map<string, number>();
  for (const [projectId, uploads] of perProject) {
    let total = 0;
    for (const id of uploads) {
      let entry = store.get(id);
      if (!entry || now - entry.at > SOURCE_CACHE_MS) {
        if (fresh >= MAX_NEW_SOURCE_SCANS && entry) {
          total += entry.bytes;
          continue;
        }
        fresh += 1;
        const dir = path.join(config.dataDir, "uploads", id);
        entry = { at: now, bytes: fs.existsSync(dir) ? directoryStats(dir).bytes : 0 };
        store.set(id, entry);
      }
      total += entry.bytes;
    }
    totals.set(projectId, total);
  }
  return totals;
}

function diskSpace(): { totalBytes: number; freeBytes: number } {
  try {
    const stats = fs.statfsSync(config.dataDir);
    return { totalBytes: stats.blocks * stats.bsize, freeBytes: stats.bavail * stats.bsize };
  } catch {
    return { totalBytes: 0, freeBytes: 0 };
  }
}

async function compute(docker: DockerRunner): Promise<LiveUsage> {
  const now = Date.now();
  const c = cache();

  if (!c.stats || now - c.stats.at > STATS_CACHE_MS) {
    const text = await docker(["stats", "--no-stream", "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"], STATS_TIMEOUT_MS).catch(() => null);
    c.stats = { at: now, value: text === null ? new Map() : parseStatsLines(text) };
  }
  if (!c.df || now - c.df.at > DF_CACHE_MS) {
    const df = await readDockerDf(docker).catch(() => null);
    if (df) c.df = { at: now, value: df };
  }
  if (!c.images || now - c.images.at > DF_CACHE_MS) {
    const text = await docker(["image", "ls", "--format", "{{.Repository}}|{{.Tag}}|{{.Size}}"], STATS_TIMEOUT_MS).catch(() => null);
    if (text !== null) c.images = { at: now, value: parseImageSizes(text) };
  }
  const stats = c.stats.value;
  const df = c.df?.value ?? null;
  const imageSizes = c.images?.value;
  const sources = sourceBytesByProject(now);

  const projects = listProjects();
  const databases = listDatabaseRecords();
  const limits = getLimits();
  const reserved = reservedMemory(projects, databases.filter((d) => d.status === "running").length, limits);

  let usedAppsMB = 0;
  const byProject: Record<string, LiveProject> = {};
  for (const project of projects) {
    const live = project.container ? stats.get(project.container) : undefined;
    if (live) usedAppsMB += live.memoryMB;
    byProject[project.id] = {
      memory: live ? { usedMB: live.memoryMB, limitMB: live.memoryLimitMB } : null,
      disk: df ? projectDisk(project, df, sources.get(project.id) ?? 0, imageSizes) : null,
    };
  }
  const usedDatabasesMB = databases.reduce((total, d) => total + (stats.get(d.container)?.memoryMB ?? 0), 0);
  const memory = serverMemory();

  return {
    at: new Date(now).toISOString(),
    server: { memoryTotalMB: memory.totalMB, memoryUsedMB: memory.usedMB, ...{ diskTotalBytes: diskSpace().totalBytes, diskFreeBytes: diskSpace().freeBytes } },
    memory: { reservedAppsMB: reserved.appsMB, reservedDatabasesMB: reserved.databasesMB, usedAppsMB, usedDatabasesMB },
    projects: byProject,
  };
}

/** What every app is using right now and what it holds on disk. Several callers at once share one reading. */
export function collectLiveUsage(docker: DockerRunner = realDocker): Promise<LiveUsage> {
  const c = cache();
  c.pending ??= compute(docker).finally(() => {
    c.pending = undefined;
  });
  return c.pending;
}

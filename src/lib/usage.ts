import fs from "node:fs";
import os from "node:os";
import { listBackups } from "./backup";
import { config } from "./config";
import { countDeploysSince, listDatabaseRecords, listProjects } from "./db";
import { directoryStats } from "./dir-stats";
import { DATABASE_MEMORY_MB, memoryToMb } from "./limits";
import { getLimits } from "./runtime-settings";

const BYTES_PER_MB = 1024 * 1024;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIZE_CACHE_MS = 5 * 60 * 1000;

export interface Usage {
  projects: { total: number; running: number };
  databases: { total: number; running: number };
  deploys30d: number;
  memory: { reservedMB: number; totalMB: number };
  cpu: { reserved: number; total: number };
  disk: { dataBytes: number; freeBytes: number; totalBytes: number };
  backups: { count: number; lastAt: string | null };
}

const globalSize = globalThis as typeof globalThis & { __renverDataSize?: { at: number; bytes: number } };

/** Walking the data folder can touch thousands of files, so the result is reused for a few minutes. */
function dataFolderBytes(): number {
  const cached = globalSize.__renverDataSize;
  if (cached && Date.now() - cached.at < SIZE_CACHE_MS) return cached.bytes;
  const bytes = fs.existsSync(config.dataDir) ? directoryStats(config.dataDir).bytes : 0;
  globalSize.__renverDataSize = { at: Date.now(), bytes };
  return bytes;
}

function diskSpace(): { freeBytes: number; totalBytes: number } {
  try {
    const stats = fs.statfsSync(config.dataDir);
    return { freeBytes: stats.bavail * stats.bsize, totalBytes: stats.blocks * stats.bsize };
  } catch {
    return { freeBytes: 0, totalBytes: 0 };
  }
}

export function collectUsage(now: Date = new Date()): Usage {
  const projects = listProjects();
  const databases = listDatabaseRecords();
  const runningApps = projects.filter((p) => p.status === "running").length;
  const runningDatabases = databases.filter((d) => d.status === "running").length;
  const limits = getLimits();
  const perAppMb = memoryToMb(limits.memory) ?? 0;
  const backups = listBackups(config.dataDir);

  return {
    projects: { total: projects.length, running: runningApps },
    databases: { total: databases.length, running: runningDatabases },
    deploys30d: countDeploysSince(new Date(now.getTime() - THIRTY_DAYS_MS).toISOString()),
    memory: {
      reservedMB: runningApps * perAppMb + runningDatabases * DATABASE_MEMORY_MB,
      totalMB: Math.round(os.totalmem() / BYTES_PER_MB),
    },
    cpu: { reserved: Math.round(runningApps * Number(limits.cpus) * 100) / 100, total: os.availableParallelism() },
    disk: { dataBytes: dataFolderBytes(), ...diskSpace() },
    backups: { count: backups.length, lastAt: backups[0]?.createdAt.toISOString() ?? null },
  };
}

import { DEFAULT_BACKUP_TIME, validateBackupTime } from "./backup-schedule";
import { config } from "./config";
import { getSetting, setSetting } from "./db";
import type { Limits } from "./limits";

/**
 * Settings changed from the Settings page. They live in the database; the environment variables only provide the
 * starting values, so a setting that was never changed still follows RENVER_APP_MEMORY and friends.
 */
const KEYS = {
  memory: "app_memory",
  cpus: "app_cpus",
  hostPortStart: "host_port_start",
  backupEnabled: "backup_enabled",
  backupTime: "backup_time",
} as const;

export function getLimits(): Limits {
  const savedPort = Number(getSetting(KEYS.hostPortStart));
  return {
    memory: getSetting(KEYS.memory) ?? config.memoryLimit,
    cpus: getSetting(KEYS.cpus) ?? config.cpuLimit,
    hostPortStart: Number.isInteger(savedPort) && savedPort > 0 ? savedPort : config.hostPortStart,
  };
}

export function saveLimits(limits: Limits): void {
  setSetting(KEYS.memory, limits.memory);
  setSetting(KEYS.cpus, limits.cpus);
  setSetting(KEYS.hostPortStart, String(limits.hostPortStart));
}

export interface BackupSchedule {
  enabled: boolean;
  /** HH:MM, server local time. */
  time: string;
}

export function getBackupSchedule(): BackupSchedule {
  const saved = getSetting(KEYS.backupTime);
  const checked = saved ? validateBackupTime(saved) : null;
  return {
    enabled: getSetting(KEYS.backupEnabled) !== "0",
    time: checked?.ok ? checked.value : DEFAULT_BACKUP_TIME,
  };
}

export function saveBackupSchedule(schedule: BackupSchedule): void {
  setSetting(KEYS.backupEnabled, schedule.enabled ? "1" : "0");
  setSetting(KEYS.backupTime, schedule.time);
}

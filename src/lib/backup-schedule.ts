/** Client-safe rules for when automatic backups run: once a day at a fixed time of day. */

export const DEFAULT_BACKUP_TIME = "03:00";

const MAX_HOURS = 23;
const MAX_MINUTES = 59;

export function parseTimeOfDay(input: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= MAX_HOURS && minutes <= MAX_MINUTES ? { hours, minutes } : null;
}

export function validateBackupTime(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const time = parseTimeOfDay(input);
  if (!time) return { ok: false, error: "Use 24-hour time as HH:MM, for example 03:00." };
  return { ok: true, value: `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}` };
}

function atTime(day: Date, time: { hours: number; minutes: number }): Date {
  const result = new Date(day);
  result.setHours(time.hours, time.minutes, 0, 0);
  return result;
}

/** The most recent moment, at or before `now`, when the daily backup was scheduled to start (server local time). */
export function lastScheduledRun(now: Date, time: string): Date {
  const parsed = parseTimeOfDay(time) ?? parseTimeOfDay(DEFAULT_BACKUP_TIME)!;
  const today = atTime(now, parsed);
  if (today.getTime() <= now.getTime()) return today;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return atTime(yesterday, parsed);
}

export interface NextBackup {
  at: Date;
  /** True when a scheduled run was missed (or never happened), so it starts at the next check. */
  isDue: boolean;
}

/**
 * When the next automatic backup runs. A run counts as done once an automatic backup exists that is newer than the
 * latest scheduled time, so if RenVer was off at the scheduled time it catches up as soon as it is running again.
 */
export function nextAutoBackup(input: {
  now: Date;
  lastAutoAt: Date | null;
  time: string;
  enabled: boolean;
}): NextBackup | null {
  if (!input.enabled) return null;

  const scheduled = lastScheduledRun(input.now, input.time);
  if (!input.lastAutoAt || input.lastAutoAt.getTime() < scheduled.getTime()) {
    return { at: input.now, isDue: true };
  }
  const parsed = parseTimeOfDay(input.time) ?? parseTimeOfDay(DEFAULT_BACKUP_TIME)!;
  const tomorrow = new Date(scheduled);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { at: atTime(tomorrow, parsed), isDue: false };
}

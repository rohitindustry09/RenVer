import { KEEP_AUTO_BACKUPS, lastAutoBackupAt } from "./backup";
import { nextAutoBackup } from "./backup-schedule";
import { config } from "./config";
import { getBackupSchedule } from "./runtime-settings";

function utcOffsetLabel(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** What the Settings page shows about automatic backups: the schedule, the last run and the next run. */
export function describeSchedule(now: Date = new Date()) {
  const schedule = getBackupSchedule();
  const last = lastAutoBackupAt(config.dataDir);
  const next = nextAutoBackup({ now, lastAutoAt: last, ...schedule });
  return {
    ...schedule,
    keep: KEEP_AUTO_BACKUPS,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffset: utcOffsetLabel(now),
    lastAutoAt: last?.toISOString() ?? null,
    next: next ? { at: next.at.toISOString(), isDue: next.isDue } : null,
    serverNow: now.toISOString(),
  };
}

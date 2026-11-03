import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKUP_TIME,
  lastScheduledRun,
  nextAutoBackup,
  parseTimeOfDay,
  validateBackupTime,
} from "@/lib/backup-schedule";

/** Local-time dates, so the tests behave the same in every time zone. */
const at = (day: number, hour: number, minute = 0, second = 0) => new Date(2026, 10, day, hour, minute, second);

describe("parseTimeOfDay", () => {
  it.each([
    ["03:00", { hours: 3, minutes: 0 }],
    ["3:05", { hours: 3, minutes: 5 }],
    ["00:00", { hours: 0, minutes: 0 }],
    ["23:59", { hours: 23, minutes: 59 }],
    [" 14:30 ", { hours: 14, minutes: 30 }],
  ])("parses %j", (input, expected) => {
    expect(parseTimeOfDay(input)).toEqual(expected);
  });

  it.each(["", "24:00", "12:60", "12", "ab:cd", "12:5", "-1:00", "12:00:00", "1200"])("rejects %j", (input) => {
    expect(parseTimeOfDay(input)).toBeNull();
  });
});

describe("validateBackupTime", () => {
  it("normalises to HH:MM", () => {
    expect(validateBackupTime("3:05")).toEqual({ ok: true, value: "03:05" });
    expect(DEFAULT_BACKUP_TIME).toBe("03:00");
  });

  it("explains what is wrong", () => {
    const result = validateBackupTime("25:00");
    expect(!result.ok && result.error).toMatch(/HH:MM/);
  });
});

describe("lastScheduledRun", () => {
  it("is today's time once it has passed", () => {
    expect(lastScheduledRun(at(2, 10, 30), "03:00")).toEqual(at(2, 3, 0));
  });

  it("is yesterday's time before today's has come", () => {
    expect(lastScheduledRun(at(2, 1, 0), "03:00")).toEqual(at(1, 3, 0));
  });

  it("counts the exact scheduled minute as having arrived", () => {
    expect(lastScheduledRun(at(2, 3, 0, 0), "03:00")).toEqual(at(2, 3, 0));
  });
});

describe("nextAutoBackup", () => {
  it("is due right now when there has never been an automatic backup", () => {
    expect(nextAutoBackup({ now: at(2, 10), lastAutoAt: null, time: "03:00", enabled: true })).toEqual({ at: at(2, 10), isDue: true });
  });

  it("waits for tomorrow's time once today's backup is done", () => {
    const result = nextAutoBackup({ now: at(2, 10), lastAutoAt: at(2, 3, 0, 20), time: "03:00", enabled: true });
    expect(result).toEqual({ at: at(3, 3, 0), isDue: false });
  });

  it("catches up when RenVer was not running at the scheduled time", () => {
    // Last backup was yesterday 03:00; it is now 09:00 and today's 03:00 was missed.
    const result = nextAutoBackup({ now: at(2, 9), lastAutoAt: at(1, 3, 0, 5), time: "03:00", enabled: true });
    expect(result).toEqual({ at: at(2, 9), isDue: true });
  });

  it("is not due before the first scheduled time has come, if yesterday's ran", () => {
    const result = nextAutoBackup({ now: at(2, 1), lastAutoAt: at(1, 3, 0, 5), time: "03:00", enabled: true });
    expect(result).toEqual({ at: at(2, 3, 0), isDue: false });
  });

  it("follows a changed time: an earlier new time that has passed is due again", () => {
    // Backup ran at 03:00; the time is moved to 08:00 and it is now 09:00.
    const result = nextAutoBackup({ now: at(2, 9), lastAutoAt: at(2, 3, 0, 5), time: "08:00", enabled: true });
    expect(result.isDue).toBe(true);
  });

  it("returns nothing when automatic backups are off", () => {
    expect(nextAutoBackup({ now: at(2, 10), lastAutoAt: null, time: "03:00", enabled: false })).toBeNull();
  });

  it("stays on the same clock time across a month end", () => {
    const result = nextAutoBackup({ now: new Date(2026, 0, 31, 10), lastAutoAt: new Date(2026, 0, 31, 3, 0, 5), time: "03:00", enabled: true });
    expect(result).toEqual({ at: new Date(2026, 1, 1, 3, 0), isDue: false });
  });
});

import { describe, expect, it } from "vitest";
import { durationLabel, formatBytes, formatDateTime, isBusyStatus, statusLabel, timeAgo } from "@/lib/format";
import { SETUP_COOKIE, shouldRedirectToSetup } from "@/lib/setup-gate";

describe("shouldRedirectToSetup", () => {
  it("sends first-time visitors from the dashboard to setup", () => {
    expect(shouldRedirectToSetup("/", false)).toBe(true);
  });

  it("does not redirect once setup is done", () => {
    expect(shouldRedirectToSetup("/", true)).toBe(false);
  });

  it("never redirects other pages, APIs or the setup page itself", () => {
    for (const path of ["/setup", "/new", "/projects/abc", "/api/system", "/settings"]) {
      expect(shouldRedirectToSetup(path, false)).toBe(false);
    }
  });

  it("exposes a stable cookie name", () => {
    expect(SETUP_COOKIE).toBe("renver_setup");
  });
});

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(formatBytes(2.5 * 1024 ** 4)).toBe("2.5 TB");
  });

  it("copes with bad input", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("formatDateTime", () => {
  it("writes an exact date and time in the given zone", () => {
    expect(formatDateTime("2026-11-02T10:30:00Z", "en-US", "UTC")).toBe("Nov 2, 2026, 10:30 AM");
    expect(formatDateTime("2026-11-02T22:05:00Z", "en-US", "Asia/Kolkata")).toBe("Nov 3, 2026, 3:35 AM");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatDateTime("nonsense")).toBe("");
  });
});

describe("durationLabel", () => {
  const start = "2026-01-10T12:00:00Z";
  it("formats seconds, minutes and hours", () => {
    expect(durationLabel(start, "2026-01-10T12:00:12Z")).toBe("12s");
    expect(durationLabel(start, "2026-01-10T12:01:05Z")).toBe("1m 5s");
    expect(durationLabel(start, "2026-01-10T14:03:00Z")).toBe("2h 3m");
  });

  it("is empty while unfinished or invalid", () => {
    expect(durationLabel(start, null)).toBe("");
    expect(durationLabel(start, "nope")).toBe("");
    expect(durationLabel(start, "2026-01-10T11:00:00Z")).toBe("");
  });
});

describe("statusLabel", () => {
  it("maps internal statuses to friendly labels", () => {
    expect(statusLabel("running")).toBe("Ready");
    expect(statusLabel("deploying")).toBe("Building");
    expect(statusLabel("failed")).toBe("Error");
    expect(statusLabel("something-new")).toBe("something-new");
  });

  it("flags in-progress statuses as busy", () => {
    expect(isBusyStatus("building")).toBe(true);
    expect(isBusyStatus("running")).toBe(false);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("formats recent times", () => {
    expect(timeAgo(ago(5_000), now)).toBe("just now");
    expect(timeAgo(ago(90_000), now)).toBe("1m ago");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3h ago");
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe("2d ago");
  });

  it("falls back to a date for old entries", () => {
    expect(timeAgo(ago(90 * 86_400_000), now)).toMatch(/Oct/);
  });

  it("handles invalid input and future times", () => {
    expect(timeAgo("nonsense", now)).toBe("");
    expect(timeAgo(new Date(now.getTime() + 60_000).toISOString(), now)).toBe("just now");
  });
});

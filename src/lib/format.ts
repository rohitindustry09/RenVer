const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RECENT_SECONDS = 45;
const MAX_RELATIVE_DAYS = 30;

const PROJECT_STATUS_LABELS: Record<string, string> = {
  running: "Ready",
  deploying: "Building",
  failed: "Error",
  created: "Queued",
  stopped: "Stopped",
  paused: "Paused",
  creating: "Creating",
  queued: "Queued",
  building: "Building",
  starting: "Starting",
  live: "Ready",
};

/** Vercel-style wording for a project or deploy status. */
export function statusLabel(status: string): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

export function isBusyStatus(status: string): boolean {
  return ["deploying", "building", "starting", "queued", "created", "creating"].includes(status);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const BYTES_PER_UNIT = 1024;

/** 1536 becomes "1.5 KB". Negative or invalid sizes read as "0 B". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit += 1;
  }
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

/** An exact date and time such as "Nov 2, 2026, 10:30 AM", in the reader's own time zone unless one is given. */
export function formatDateTime(iso: string, locale?: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

/** "12s", "1m 5s", "2h 3m" between two timestamps; "" while the end is unknown or invalid. */
export function durationLabel(startIso: string, endIso: string | null): string {
  if (!endIso) return "";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const totalSeconds = Math.round(ms / SECOND_MS);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, now.getTime() - then);

  if (diff < RECENT_SECONDS * SECOND_MS) return "just now";
  if (diff < HOUR_MS) return `${Math.max(1, Math.floor(diff / MINUTE_MS))}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < MAX_RELATIVE_DAYS * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

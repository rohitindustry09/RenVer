/** Rules for the round progress meters. Client-safe and pure. */

export type GaugeTone = "ok" | "warn" | "bad" | "idle";

const WARN_RATIO = 0.75;
const BAD_RATIO = 0.9;

/** Share of a whole, kept between 0 and 1. An empty or unknown whole is 0. */
export const ratioOf = (part: number, whole: number): number => (whole > 0 && Number.isFinite(part) ? Math.min(1, Math.max(0, part / whole)) : 0);

/** Green until it nears full, then amber, then red. */
export function gaugeTone(ratio: number, warnAt = WARN_RATIO, badAt = BAD_RATIO): GaugeTone {
  if (ratio >= badAt) return "bad";
  if (ratio >= warnAt) return "warn";
  return "ok";
}

/** "23%", and "<1%" for something small but not empty, so a tiny share is not shown as nothing. */
export function percentLabel(ratio: number): string {
  if (!(ratio > 0)) return "0%";
  const percent = ratio * 100;
  return percent < 1 ? "<1%" : `${Math.round(percent)}%`;
}

/** Memory in MB or GB, the way the rest of the page writes it: "182 MB", "1.5 GB". */
export function formatMB(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return "0 MB";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

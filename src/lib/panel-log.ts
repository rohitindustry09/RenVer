import { logSize, readLog } from "./logs";

/** What the launcher saved of the panel's own output (data/logs/panel.log). */
const PANEL_LOG_ID = "panel";
const FIRST_LOOK_BYTES = 64 * 1024;
const NEWLINE = "\n";

/**
 * Pass -1 for the first look: the most recent part of the log, starting on a whole line. After that pass the `next`
 * value from the previous answer to get only what is new.
 */
export function readPanelLog(offset: number): { text: string; next: number } {
  if (offset >= 0) return readLog(PANEL_LOG_ID, offset);
  const start = Math.max(0, logSize(PANEL_LOG_ID) - FIRST_LOOK_BYTES);
  const read = readLog(PANEL_LOG_ID, start);
  if (start === 0) return read;
  const firstBreak = read.text.indexOf(NEWLINE);
  return { text: firstBreak < 0 ? "" : read.text.slice(firstBreak + 1), next: read.next };
}

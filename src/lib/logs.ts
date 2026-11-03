import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

const LOG_ID_PATTERN = /^[a-z0-9-]{1,40}$/i;
const MAX_READ_BYTES = 256 * 1024;
const NEWLINE = 0x0a;

function logPath(deployId: string): string {
  if (!LOG_ID_PATTERN.test(deployId)) throw new Error("Invalid deploy id");
  return path.join(config.dataDir, "logs", `${deployId}.log`);
}

export function appendLog(deployId: string, line: string): void {
  const file = logPath(deployId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${line}\n`);
}

export function resetLog(deployId: string): void {
  fs.rmSync(logPath(deployId), { force: true });
}

/**
 * Reads whole lines from a byte offset so callers can poll for new output.
 * Reads are capped, and always end on a newline so multi-byte characters are never split.
 */
export function readLog(deployId: string, offset: number): { text: string; next: number } {
  const file = logPath(deployId);
  if (!fs.existsSync(file)) return { text: "", next: 0 };
  const size = fs.statSync(file).size;
  if (offset >= size) return { text: "", next: size };

  const length = Math.min(size - offset, MAX_READ_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, length, offset);
  } finally {
    fs.closeSync(fd);
  }

  const lastNewline = buffer.lastIndexOf(NEWLINE);
  if (lastNewline < 0) return { text: "", next: offset };
  const complete = buffer.subarray(0, lastNewline + 1);
  return { text: complete.toString("utf8"), next: offset + complete.length };
}

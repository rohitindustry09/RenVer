import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-logs-"));
process.env.RENVER_DATA_DIR = dataDir;

const { appendLog, readLog } = await import("@/lib/logs");

beforeAll(() => fs.mkdirSync(dataDir, { recursive: true }));
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe("logs", () => {
  it("returns nothing for an unknown deploy", () => {
    expect(readLog("nope", 0)).toEqual({ text: "", next: 0 });
  });

  it("reads incrementally from the returned offset", () => {
    appendLog("inc", "one");
    const first = readLog("inc", 0);
    expect(first.text).toBe("one\n");
    appendLog("inc", "two");
    const second = readLog("inc", first.next);
    expect(second.text).toBe("two\n");
    expect(readLog("inc", second.next).text).toBe("");
  });

  it("keeps multi-byte characters intact across polls", () => {
    appendLog("utf", "héllo ✓ wörld");
    const result = readLog("utf", 0);
    expect(result.text).toBe("héllo ✓ wörld\n");
    expect(result.next).toBe(Buffer.byteLength("héllo ✓ wörld\n"));
  });

  it("caps a single read and stops on a line boundary", () => {
    const line = "x".repeat(1000);
    for (let i = 0; i < 400; i++) appendLog("big", line);
    const chunk = readLog("big", 0);
    expect(chunk.text.length).toBeLessThanOrEqual(256 * 1024);
    expect(chunk.text.endsWith("\n")).toBe(true);
    let offset = chunk.next;
    let total = chunk.text.length;
    while (true) {
      const more = readLog("big", offset);
      if (!more.text) break;
      total += more.text.length;
      offset = more.next;
    }
    expect(total).toBe(400 * 1001);
  });

  it("rejects ids that could escape the log folder", () => {
    expect(() => appendLog("../evil", "x")).toThrow(/invalid/i);
    expect(() => readLog("a/b", 0)).toThrow(/invalid/i);
  });
});

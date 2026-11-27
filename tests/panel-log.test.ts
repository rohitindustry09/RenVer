import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-panel-log-"));
process.env.RENVER_DATA_DIR = dataDir;

const { readPanelLog } = await import("@/lib/panel-log");
const file = path.join(dataDir, "logs", "panel.log");
const write = (text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

describe("reading the panel log", () => {
  it("is empty before the panel has written anything", () => {
    fs.rmSync(file, { force: true });
    expect(readPanelLog(-1)).toEqual({ text: "", next: 0 });
  });

  it("starts with the most recent lines, on a whole line", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n") + "\n";
    write(lines);
    const first = readPanelLog(-1);
    expect(first.text.length).toBeLessThanOrEqual(70_000);
    expect(first.text.startsWith("line ")).toBe(true);
    expect(first.text.trimEnd().endsWith("line 4999")).toBe(true);
    expect(first.next).toBe(Buffer.byteLength(lines));
  });

  it("returns only what is new after an offset", () => {
    write("one\ntwo\n");
    const first = readPanelLog(-1);
    fs.appendFileSync(file, "three\n");
    const second = readPanelLog(first.next);
    expect(second.text).toBe("three\n");
    expect(readPanelLog(second.next).text).toBe("");
  });

  it("starts over when the file was replaced by a smaller one", () => {
    write("a long first file\nwith lines\n");
    const big = readPanelLog(-1).next;
    write("new\n");
    expect(readPanelLog(big)).toEqual({ text: "", next: 4 });
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { directoryStats } from "@/lib/dir-stats";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-stats-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("directoryStats", () => {
  it("counts files and bytes recursively", () => {
    fs.mkdirSync(path.join(dir, "a", "b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "one.txt"), "12345");
    fs.writeFileSync(path.join(dir, "a", "two.txt"), "123");
    fs.writeFileSync(path.join(dir, "a", "b", "three.txt"), "12");
    expect(directoryStats(dir)).toEqual({ files: 3, bytes: 10 });
  });

  it("returns zeros for an empty folder", () => {
    expect(directoryStats(dir)).toEqual({ files: 0, bytes: 0 });
  });

  it("stops early once a limit is exceeded", () => {
    for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(dir, `f${i}.txt`), "x");
    const stats = directoryStats(dir, { maxFiles: 5 });
    expect(stats.files).toBeGreaterThan(5);
    expect(stats.files).toBeLessThan(20);
  });

  it("does not follow symlinked folders", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "renver-outside-"));
    fs.writeFileSync(path.join(outside, "big.txt"), "x".repeat(500));
    try {
      fs.symlinkSync(outside, path.join(dir, "link"), "junction");
      expect(directoryStats(dir).bytes).toBeLessThan(500);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

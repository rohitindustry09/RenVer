import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readHead } from "@/lib/github";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-head-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const git = (...args: string[]) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" });

describe("readHead", () => {
  it("returns the commit id and the first line of its message", async () => {
    git("init", "-q");
    fs.writeFileSync(path.join(dir, "a.txt"), "x");
    git("add", ".");
    git("commit", "-q", "-m", "Fix the login page\n\nLonger explanation that must not be included");
    const expected = git("rev-parse", "HEAD").stdout.trim();

    const head = await readHead(dir);
    expect(head.commit).toBe(expected);
    expect(head.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(head.message).toBe("Fix the login page");
  });

  it("gives nulls, not an error, for a folder that is not a repository", async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "renver-nohead-"));
    try {
      expect(await readHead(empty)).toEqual({ commit: null, message: null });
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensurePrivateDir } from "@/lib/private-dir";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const base = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-private-"));
  made.push(dir);
  return dir;
};

describe("ensurePrivateDir", () => {
  it("creates missing folders, parents included", () => {
    const target = path.join(base(), "a", "b");
    ensurePrivateDir(target);
    expect(fs.statSync(target).isDirectory()).toBe(true);
  });

  it("is safe to call on a folder that already exists, and keeps what is in it", () => {
    const target = path.join(base(), "data");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "keep.txt"), "x");
    ensurePrivateDir(target);
    expect(fs.readFileSync(path.join(target, "keep.txt"), "utf8")).toBe("x");
  });

  it.skipIf(process.platform === "win32")("leaves the folder readable by its owner only", () => {
    const target = path.join(base(), "data");
    fs.mkdirSync(target, { mode: 0o755 });
    ensurePrivateDir(target);
    expect(fs.statSync(target).mode & 0o777).toBe(0o700);
  });
});

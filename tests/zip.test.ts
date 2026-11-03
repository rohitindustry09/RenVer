import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractZip } from "@/lib/zip";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "renver-zip-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeZip(entries: Record<string, string>): string {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content));
  }
  const zipPath = path.join(tmp, "in.zip");
  zip.writeZip(zipPath);
  return zipPath;
}

describe("extractZip", () => {
  it("extracts files into the destination", () => {
    const dest = path.join(tmp, "out");
    const result = extractZip(makeZip({ "package.json": "{}", "src/a.js": "x" }), dest);
    expect(result.root).toBe(dest);
    expect(fs.readFileSync(path.join(dest, "src", "a.js"), "utf8")).toBe("x");
  });

  it("flattens a single top-level folder", () => {
    const dest = path.join(tmp, "out");
    const result = extractZip(makeZip({ "my-app/package.json": "{}", "my-app/index.js": "x" }), dest);
    expect(result.root).toBe(path.join(dest, "my-app"));
    expect(fs.existsSync(path.join(result.root, "package.json"))).toBe(true);
  });

  it("rejects path traversal entries", () => {
    // AdmZip sanitises "../" when writing, so patch the raw bytes to build a real attack archive.
    const zipPath = makeZip({ "xxxevil.txt": "x" });
    const patched = fs.readFileSync(zipPath).toString("latin1").split("xxxevil.txt").join("../evil.txt");
    fs.writeFileSync(zipPath, Buffer.from(patched, "latin1"));

    const dest = path.join(tmp, "out");
    expect(() => extractZip(zipPath, dest)).toThrow(/unsafe/i);
    expect(fs.existsSync(path.join(tmp, "evil.txt"))).toBe(false);
  });

  it("rejects symlink entries", () => {
    const zip = new AdmZip();
    zip.addFile("link", Buffer.from("/etc/passwd"));
    zip.getEntry("link")!.attr = (0o120777 << 16) >>> 0;
    const zipPath = path.join(tmp, "link.zip");
    zip.writeZip(zipPath);
    expect(() => extractZip(zipPath, path.join(tmp, "out"))).toThrow(/symlink/i);
  });

  it("skips node_modules and .git", () => {
    const dest = path.join(tmp, "out");
    const result = extractZip(
      makeZip({ "package.json": "{}", "node_modules/x/index.js": "x", ".git/HEAD": "x" }),
      dest,
    );
    expect(fs.existsSync(path.join(result.root, "node_modules"))).toBe(false);
    expect(fs.existsSync(path.join(result.root, ".git"))).toBe(false);
  });

  it("rejects archives over the size limit", () => {
    const dest = path.join(tmp, "out");
    expect(() =>
      extractZip(makeZip({ "big.txt": "x".repeat(1000) }), dest, { maxBytes: 100, maxFiles: 10 }),
    ).toThrow(/too large/i);
  });

  it("rejects archives with too many files", () => {
    const dest = path.join(tmp, "out");
    const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.txt`, "x"]));
    expect(() => extractZip(makeZip(many), dest, { maxBytes: 1000, maxFiles: 3 })).toThrow(
      /too many files/i,
    );
  });
});

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/** Uses real Docker, but only touches volumes this test creates. Skipped when Docker is not running. */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-cleanup-"));
process.env.RENVER_DATA_DIR = dataDir;

const docker = (...args: string[]) => spawnSync("docker", args, { encoding: "utf8", timeout: 120_000 });
const available = docker("version", "--format", "{{.Server.Version}}").status === 0;

const id = randomBytes(4).toString("hex");
const orphan = `renver-vol-itest-${id}`;
const foreign = `itest-foreign-${id}`;
const exists = (name: string) => docker("volume", "inspect", name).status === 0;

const globalDb = globalThis as { __renverDb?: { close(): void } };
afterAll(() => {
  docker("volume", "rm", "-f", orphan);
  docker("volume", "rm", "-f", foreign);
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe.skipIf(!available)("cleaning with real Docker", () => {
  it("offers an unused RenVer volume, never another tool's, and removes only what is chosen", async () => {
    docker("volume", "create", orphan);
    docker("volume", "create", foreign);
    const { runCleanup, scanDisk } = await import("@/lib/cleanup-run");

    const scan = await scanDisk();
    const offered = scan.categories.flatMap((c) => c.items.map((i) => i.id));
    expect(offered).toContain(orphan);
    expect(offered).not.toContain(foreign);
    expect(scan.other.count).toBeGreaterThanOrEqual(1);

    const result = await runCleanup({ buildCache: false, images: false, volumes: [orphan, foreign] });
    expect(exists(orphan)).toBe(false);
    expect(exists(foreign)).toBe(true);
    expect(result.steps.filter((s) => s.ok)).toHaveLength(1);
    expect(result.steps.filter((s) => !s.ok)).toHaveLength(1);
  }, 180_000);
});

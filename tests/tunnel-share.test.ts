import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

process.env.RENVER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "renver-share-"));

const start = vi.fn(async () => "https://x.trycloudflare.com");
const stop = vi.fn();
vi.mock("@/lib/tunnels", () => ({ tunnels: () => ({ start, stop, get: () => null }) }));

const share = await import("@/lib/tunnel-share");

describe("share on deploy", () => {
  it("remembers whether a project should be shared", () => {
    expect(share.wantsShare("p1")).toBe(false);
    share.setWantsShare("p1", true);
    expect(share.wantsShare("p1")).toBe(true);
    share.setWantsShare("p1", false);
    expect(share.wantsShare("p1")).toBe(false);
  });

  it("does nothing for a project that is not shared", async () => {
    start.mockClear();
    await share.resumeShare("p2", 4001, () => undefined);
    expect(start).not.toHaveBeenCalled();
  });

  it("restarts the tunnel on the new port after a deploy and logs the address", async () => {
    share.setWantsShare("p3", true);
    start.mockClear();
    stop.mockClear();
    const lines: string[] = [];
    await share.resumeShare("p3", 4005, (l) => lines.push(l));
    expect(stop).toHaveBeenCalledWith("p3");
    expect(start).toHaveBeenCalledWith("p3", 4005);
    expect(lines.join("\n")).toContain("https://x.trycloudflare.com");
  });

  it("logs the reason instead of failing the deploy when the tunnel cannot start", async () => {
    share.setWantsShare("p4", true);
    start.mockRejectedValueOnce(new Error("cloudflared is not installed."));
    const lines: string[] = [];
    await expect(share.resumeShare("p4", 4006, (l) => lines.push(l))).resolves.toBeUndefined();
    expect(lines.join("\n")).toContain("cloudflared is not installed.");
  });
});

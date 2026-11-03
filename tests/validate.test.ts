import { describe, expect, it } from "vitest";
import { detectProject } from "@/lib/detect";
import { parseEnv, parseProjectConfig } from "@/lib/validate";

const base = detectProject({
  exists: (p) => p === "package.json",
  read: (p) =>
    p === "package.json"
      ? JSON.stringify({
          dependencies: { next: "15.0.0" },
          scripts: { build: "next build", start: "next start" },
        })
      : null,
});

describe("parseProjectConfig", () => {
  it("falls back to the detected values", () => {
    const cfg = parseProjectConfig({}, base);
    expect(cfg.buildCommand).toBe("npm run build");
    expect(cfg.port).toBe(3000);
    expect(cfg.framework).toBe("nextjs");
  });

  it("applies overrides and treats empty strings as null", () => {
    const cfg = parseProjectConfig({ buildCommand: "", startCommand: "node x.js", port: 8080 }, base);
    expect(cfg.buildCommand).toBeNull();
    expect(cfg.startCommand).toBe("node x.js");
    expect(cfg.port).toBe(8080);
  });

  it("rejects commands containing newlines", () => {
    expect(() => parseProjectConfig({ startCommand: "node x.js\nFROM evil" }, base)).toThrow(/single line/i);
  });

  it("rejects out-of-range ports", () => {
    expect(() => parseProjectConfig({ port: 0 }, base)).toThrow(/port/i);
    expect(() => parseProjectConfig({ port: 70000 }, base)).toThrow(/port/i);
    expect(() => parseProjectConfig({ port: "80" }, base)).toThrow(/port/i);
  });

  it("rejects over-long commands", () => {
    expect(() => parseProjectConfig({ buildCommand: "x".repeat(501) }, base)).toThrow(/too long/i);
  });
});

describe("parseEnv", () => {
  it("accepts a string map", () => {
    expect(parseEnv({ A_B: "1", C: "two" })).toEqual({ A_B: "1", C: "two" });
  });

  it("returns an empty object for missing input", () => {
    expect(parseEnv(undefined)).toEqual({});
  });

  it("rejects invalid keys", () => {
    expect(() => parseEnv({ "bad key": "x" })).toThrow(/invalid/i);
  });

  it.each(["PATH", "DOCKER_HOST", "LD_PRELOAD", "NODE_OPTIONS", "path"])(
    "rejects reserved key %s",
    (key) => {
      expect(() => parseEnv({ [key]: "x" })).toThrow(/reserved/i);
    },
  );

  it("rejects non-string values", () => {
    expect(() => parseEnv({ A: 1 })).toThrow(/string/i);
  });
});

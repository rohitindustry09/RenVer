import { describe, expect, it } from "vitest";
import { parseDockerStats } from "@/lib/docker-stats";
import { effectiveLimits, validateProjectLimits } from "@/lib/limits";

const globalLimits = { memory: "512m", cpus: "1", hostPortStart: 4000 };

describe("effectiveLimits", () => {
  it("uses the global limits when a project sets none", () => {
    expect(effectiveLimits(globalLimits, undefined)).toEqual({ memory: "512m", cpus: "1" });
    expect(effectiveLimits(globalLimits, {})).toEqual({ memory: "512m", cpus: "1" });
  });

  it("lets a project override one or both", () => {
    expect(effectiveLimits(globalLimits, { memory: "2g" })).toEqual({ memory: "2g", cpus: "1" });
    expect(effectiveLimits(globalLimits, { memory: "2g", cpus: "2" })).toEqual({ memory: "2g", cpus: "2" });
  });
});

describe("validateProjectLimits", () => {
  it("treats blank fields as 'use the default'", () => {
    expect(validateProjectLimits({ memory: "", cpus: " " }, 8)).toEqual({ ok: true, value: {} });
  });

  it("normalises valid values", () => {
    expect(validateProjectLimits({ memory: "1024 MB", cpus: "1.50" }, 8)).toEqual({ ok: true, value: { memory: "1g", cpus: "1.5" } });
  });

  it("reports each bad field", () => {
    const result = validateProjectLimits({ memory: "lots", cpus: "99" }, 4);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["cpus", "memory"]);
  });
});

describe("parseDockerStats", () => {
  it("reads CPU and memory from docker stats output", () => {
    expect(parseDockerStats("1.50%|45.3MiB / 512MiB")).toEqual({ cpuPercent: 1.5, memoryMB: 45.3, memoryLimitMB: 512 });
    expect(parseDockerStats("0.00%|1.2GiB / 2GiB")).toEqual({ cpuPercent: 0, memoryMB: 1228.8, memoryLimitMB: 2048 });
    expect(parseDockerStats("12%|900KiB / 1GiB")?.memoryMB).toBeCloseTo(0.879, 2);
  });

  it("returns null for anything unreadable", () => {
    expect(parseDockerStats("")).toBeNull();
    expect(parseDockerStats("--|-- / --")).toBeNull();
    expect(parseDockerStats("nonsense")).toBeNull();
  });
});

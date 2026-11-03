import { describe, expect, it } from "vitest";
import { memoryToMb, validateCpus, validateLimits, validateMemory, validatePortStart } from "@/lib/limits";

describe("validateMemory", () => {
  it.each([
    ["512m", "512m"],
    ["512M", "512m"],
    ["512 MB", "512m"],
    ["1g", "1g"],
    ["2G", "2g"],
    ["1.5g", "1536m"],
    ["1024m", "1g"],
    ["  256m ", "256m"],
    ["64m", "64m"],
  ])("accepts %j as %j", (input, expected) => {
    expect(validateMemory(input)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "512", "m", "-1g", "0m", "63m", "65g", "abc", "1.5.2g", "512mb; rm", "1e3m", "512 k"])("rejects %j", (input) => {
    expect(validateMemory(input).ok).toBe(false);
  });

  it("explains the allowed range", () => {
    const result = validateMemory("10m");
    expect(!result.ok && result.error).toMatch(/64m/);
  });
});

describe("memoryToMb", () => {
  it("converts normalised sizes to megabytes", () => {
    expect(memoryToMb("512m")).toBe(512);
    expect(memoryToMb("1g")).toBe(1024);
    expect(memoryToMb("1536m")).toBe(1536);
    expect(memoryToMb("2G")).toBe(2048);
  });

  it("returns null for anything else", () => {
    expect(memoryToMb("")).toBeNull();
    expect(memoryToMb("lots")).toBeNull();
  });
});

describe("validateCpus", () => {
  it.each([
    ["1", "1"],
    ["0.5", "0.5"],
    ["2", "2"],
    ["1.50", "1.5"],
    [" 0.25 ", "0.25"],
  ])("accepts %j as %j on a 4 CPU machine", (input, expected) => {
    expect(validateCpus(input, 4)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "0", "-1", "0.05", "abc", "1,5", "5", "1e1"])("rejects %j on a 4 CPU machine", (input) => {
    expect(validateCpus(input, 4).ok).toBe(false);
  });

  it("says how many CPUs the machine has when asked for too many", () => {
    const result = validateCpus("8", 4);
    expect(!result.ok && result.error).toMatch(/4/);
  });
});

describe("validatePortStart", () => {
  it("accepts a sensible start", () => {
    expect(validatePortStart("4001")).toEqual({ ok: true, value: 4001 });
    expect(validatePortStart(5000)).toEqual({ ok: true, value: 5000 });
  });

  it.each(["", "abc", "80", "1023", "64001", "65535", "4001.5", "-4001"])("rejects %j", (input) => {
    expect(validatePortStart(input).ok).toBe(false);
  });
});

describe("validateLimits", () => {
  const good = { memory: "1g", cpus: "2", hostPortStart: "4100" };

  it("returns the normalised limits", () => {
    expect(validateLimits(good, 8)).toEqual({ ok: true, value: { memory: "1g", cpus: "2", hostPortStart: 4100 } });
  });

  it("collects every problem by field", () => {
    const result = validateLimits({ memory: "x", cpus: "99", hostPortStart: "5" }, 4);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["cpus", "hostPortStart", "memory"]);
  });
});

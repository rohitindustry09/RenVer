import { describe, expect, it } from "vitest";
import { freshOrStale } from "@/lib/fresh-or-stale";

const later = <T>(value: T, ms: number) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("freshOrStale", () => {
  it("returns the fresh answer when it arrives in time", async () => {
    expect(await freshOrStale(() => later("fresh", 5), () => "old", 100)).toBe("fresh");
  });

  it("returns the old answer at once when the fresh one is slow, and lets the check finish", async () => {
    let finished = false;
    const slow = async () => {
      await later(null, 60);
      finished = true;
      return "fresh";
    };
    const started = Date.now();
    expect(await freshOrStale(slow, () => "old", 10)).toBe("old");
    expect(Date.now() - started).toBeLessThan(50);
    await later(null, 80);
    expect(finished).toBe(true);
  });

  it("returns nothing when it is slow and there is no old answer", async () => {
    expect(await freshOrStale(() => later("fresh", 60), () => null, 10)).toBeNull();
  });

  it("returns the old answer when the check fails, without throwing", async () => {
    const failing = async () => {
      throw new Error("offline");
    };
    expect(await freshOrStale(failing, () => "old", 100)).toBe("old");
  });
});

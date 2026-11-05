import { describe, expect, it } from "vitest";
import { formatMB, gaugeTone, percentLabel, ratioOf } from "@/lib/gauge";

describe("ratioOf", () => {
  it("is the share of a whole, kept between 0 and 1", () => {
    expect(ratioOf(1, 4)).toBe(0.25);
    expect(ratioOf(9, 4)).toBe(1);
    expect(ratioOf(-3, 4)).toBe(0);
  });

  it("is 0 when the whole is empty or the part is not a number", () => {
    expect(ratioOf(5, 0)).toBe(0);
    expect(ratioOf(Number.NaN, 10)).toBe(0);
    expect(ratioOf(Number.POSITIVE_INFINITY, 10)).toBe(0);
  });
});

describe("gaugeTone", () => {
  it("is green, then amber near full, then red", () => {
    expect(gaugeTone(0.2)).toBe("ok");
    expect(gaugeTone(0.75)).toBe("warn");
    expect(gaugeTone(0.89)).toBe("warn");
    expect(gaugeTone(0.9)).toBe("bad");
  });

  it("takes its own thresholds, for a small share of a big disk", () => {
    expect(gaugeTone(0.1, 0.25, 0.5)).toBe("ok");
    expect(gaugeTone(0.3, 0.25, 0.5)).toBe("warn");
    expect(gaugeTone(0.6, 0.25, 0.5)).toBe("bad");
  });
});

describe("percentLabel", () => {
  it("rounds, and never shows a small but real share as nothing", () => {
    expect(percentLabel(0.234)).toBe("23%");
    expect(percentLabel(1)).toBe("100%");
    expect(percentLabel(0.004)).toBe("<1%");
    expect(percentLabel(0)).toBe("0%");
    expect(percentLabel(Number.NaN)).toBe("0%");
  });
});

describe("formatMB", () => {
  it("writes small amounts in MB and large ones in GB", () => {
    expect(formatMB(182.4)).toBe("182 MB");
    expect(formatMB(1536)).toBe("1.5 GB");
    expect(formatMB(0)).toBe("0 MB");
    expect(formatMB(Number.NaN)).toBe("0 MB");
  });
});

import { describe, expect, it } from "vitest";
import { moveSelection } from "@/lib/select-nav";

const opts = (...disabled: boolean[]) => disabled.map((isDisabled) => ({ isDisabled }));

describe("moveSelection", () => {
  it("steps down and up", () => {
    const list = opts(false, false, false);
    expect(moveSelection(list, 0, 1)).toBe(1);
    expect(moveSelection(list, 2, -1)).toBe(1);
  });

  it("stays at the ends instead of wrapping", () => {
    const list = opts(false, false);
    expect(moveSelection(list, 1, 1)).toBe(1);
    expect(moveSelection(list, 0, -1)).toBe(0);
  });

  it("skips disabled options", () => {
    const list = opts(false, true, false);
    expect(moveSelection(list, 0, 1)).toBe(2);
    expect(moveSelection(list, 2, -1)).toBe(0);
  });

  it("stays put when nothing further is enabled", () => {
    expect(moveSelection(opts(false, true), 0, 1)).toBe(0);
  });

  it("starts from the first or last enabled option when nothing is active", () => {
    const list = opts(true, false, false, true);
    expect(moveSelection(list, -1, 1)).toBe(1);
    expect(moveSelection(list, -1, -1)).toBe(2);
  });

  it("returns -1 for an empty or fully disabled list", () => {
    expect(moveSelection([], -1, 1)).toBe(-1);
    expect(moveSelection(opts(true, true), -1, 1)).toBe(-1);
  });
});

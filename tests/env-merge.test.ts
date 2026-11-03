import { describe, expect, it } from "vitest";
import { applyEnvChanges } from "@/lib/env-merge";

describe("applyEnvChanges", () => {
  const current = { A: "1", B: "2" };

  it("adds and changes variables while keeping the rest", () => {
    expect(applyEnvChanges(current, { set: { B: "new", C: "3" } })).toEqual({ A: "1", B: "new", C: "3" });
  });

  it("removes variables", () => {
    expect(applyEnvChanges(current, { remove: ["A"] })).toEqual({ B: "2" });
  });

  it("ignores removing something that is not there", () => {
    expect(applyEnvChanges(current, { remove: ["NOPE"] })).toEqual(current);
  });

  it("applies a removal before a set, so a variable can be replaced in one go", () => {
    expect(applyEnvChanges(current, { remove: ["A"], set: { A: "again" } })).toEqual({ B: "2", A: "again" });
  });

  it("does not change the object it was given", () => {
    const original = { A: "1" };
    applyEnvChanges(original, { set: { A: "2" }, remove: ["A"] });
    expect(original).toEqual({ A: "1" });
  });

  it("returns an unchanged copy when there is nothing to do", () => {
    expect(applyEnvChanges(current, {})).toEqual(current);
  });
});

import { describe, expect, it } from "vitest";
import { variablesHoldingUrl } from "@/lib/database-links";

const URL = "postgres://app:secret@renver-db-1:5432/app";

describe("variablesHoldingUrl", () => {
  it("finds the variables that hold the connection string", () => {
    expect(variablesHoldingUrl({ DATABASE_URL: URL, PORT: "3000" }, URL)).toEqual(["DATABASE_URL"]);
  });

  it("finds every variable that holds it", () => {
    expect(variablesHoldingUrl({ A: URL, B: URL }, URL).sort()).toEqual(["A", "B"]);
  });

  it("ignores variables with a different value, even a similar one", () => {
    expect(variablesHoldingUrl({ DATABASE_URL: `${URL}?ssl=1` }, URL)).toEqual([]);
  });

  it("returns nothing for an empty environment", () => {
    expect(variablesHoldingUrl({}, URL)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { matchesConfirmPhrase } from "@/lib/confirm-phrase";

describe("matchesConfirmPhrase", () => {
  it("accepts the exact phrase, ignoring surrounding spaces", () => {
    expect(matchesConfirmPhrase("my-store", "my-store")).toBe(true);
    expect(matchesConfirmPhrase("  my-store ", "my-store")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(matchesConfirmPhrase("", "my-store")).toBe(false);
    expect(matchesConfirmPhrase("my-stor", "my-store")).toBe(false);
    expect(matchesConfirmPhrase("My-Store", "my-store")).toBe(false);
    expect(matchesConfirmPhrase("my store", "my-store")).toBe(false);
  });

  it("never matches when there is no phrase to type", () => {
    expect(matchesConfirmPhrase("", "")).toBe(false);
  });
});

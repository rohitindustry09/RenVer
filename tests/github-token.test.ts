import { describe, expect, it } from "vitest";
import { redactToken, validateGithubToken } from "@/lib/github-token";

const FINE = `github_pat_${"A1b2C3d4E5".repeat(6)}`;
const CLASSIC = `ghp_${"a1B2c3D4e5".repeat(4)}`;

describe("validateGithubToken", () => {
  it("accepts fine-grained and classic tokens, ignoring surrounding spaces", () => {
    expect(validateGithubToken(`  ${FINE}\n`)).toEqual({ ok: true, value: FINE });
    expect(validateGithubToken(CLASSIC)).toEqual({ ok: true, value: CLASSIC });
  });

  it("refuses empty text, text with spaces inside, and things that are not tokens", () => {
    for (const bad of ["", "   ", `${CLASSIC} extra`, "hunter2", "ghp_short", `Bearer ${CLASSIC}`, "https://github.com/me/repo"]) {
      expect(validateGithubToken(bad).ok).toBe(false);
    }
  });
});

describe("redactToken", () => {
  it("hides the token and anything shaped like one", () => {
    expect(redactToken(`failed with ${CLASSIC} here`, CLASSIC)).toBe("failed with *** here");
    expect(redactToken(`header ${FINE}`, null)).toBe("header ***");
    expect(redactToken("nothing secret", CLASSIC)).toBe("nothing secret");
  });
});

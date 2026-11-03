import { describe, expect, it } from "vitest";
import { isValidBranch, parseGithubUrl } from "@/lib/github-url";

describe("parseGithubUrl", () => {
  it.each([
    "https://github.com/vercel/next.js",
    "https://github.com/vercel/next.js.git",
    "https://github.com/vercel/next.js/",
    "http://github.com/vercel/next.js",
    "https://www.github.com/vercel/next.js",
    "github.com/vercel/next.js",
    "vercel/next.js",
    "  vercel/next.js  ",
  ])("accepts %s", (input) => {
    const result = parseGithubUrl(input);
    expect(result).toEqual({
      ok: true,
      owner: "vercel",
      repo: "next.js",
      branch: null,
      cloneUrl: "https://github.com/vercel/next.js.git",
      label: "vercel/next.js",
    });
  });

  it("reads the branch from a /tree/ URL", () => {
    const result = parseGithubUrl("https://github.com/acme/shop/tree/develop");
    expect(result.ok && result.branch).toBe("develop");
  });

  it("rejects folder paths below a branch", () => {
    const result = parseGithubUrl("https://github.com/acme/shop/tree/main/apps/web");
    expect(result.ok).toBe(false);
  });

  it.each([
    "",
    "   ",
    "https://gitlab.com/acme/shop",
    "https://evil.com/github.com/acme/shop",
    "https://github.com.evil.com/acme/shop",
    "git@github.com:acme/shop.git",
    "file:///etc/passwd",
    "https://user:pass@github.com/acme/shop",
    "https://github.com/acme",
    "https://github.com/-acme/shop",
    "https://github.com/acme/shop;rm -rf /",
    "https://github.com/acme/..",
    "acme",
    "../../etc/passwd",
    "--upload-pack=calc/x",
  ])("rejects %j", (input) => {
    expect(parseGithubUrl(input).ok).toBe(false);
  });

  it("returns a helpful message", () => {
    const result = parseGithubUrl("https://gitlab.com/a/b");
    expect(!result.ok && result.error).toMatch(/github/i);
  });
});

describe("isValidBranch", () => {
  it.each(["main", "feature/new-ui", "release-1.2", "v2.0.1"])("accepts %s", (b) => {
    expect(isValidBranch(b)).toBe(true);
  });

  it.each(["", "-x", "--upload-pack=x", "a..b", "/abs", "trail/", "has space", "a;b", "x.lock", "a".repeat(101)])(
    "rejects %j",
    (b) => {
      expect(isValidBranch(b)).toBe(false);
    },
  );
});

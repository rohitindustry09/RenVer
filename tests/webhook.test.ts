import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pushTargetsBranch, verifyGithubSignature } from "@/lib/webhook";

const secret = "s3cret-value";
const sign = (body: string, key = secret) => `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;

describe("verifyGithubSignature", () => {
  const body = '{"ref":"refs/heads/main"}';

  it("accepts a correct signature", () => {
    expect(verifyGithubSignature(secret, body, sign(body))).toBe(true);
  });

  it("rejects a wrong secret, a changed body, and missing or malformed headers", () => {
    expect(verifyGithubSignature(secret, body, sign(body, "other"))).toBe(false);
    expect(verifyGithubSignature(secret, `${body} `, sign(body))).toBe(false);
    expect(verifyGithubSignature(secret, body, null)).toBe(false);
    expect(verifyGithubSignature(secret, body, "sha1=abc")).toBe(false);
    expect(verifyGithubSignature(secret, body, "sha256=zz")).toBe(false);
    expect(verifyGithubSignature(secret, body, "")).toBe(false);
  });

  it("never accepts anything when there is no secret", () => {
    expect(verifyGithubSignature("", body, sign(body, ""))).toBe(false);
  });
});

describe("pushTargetsBranch", () => {
  const push = (ref: string, defaultBranch = "main") => ({ ref, repository: { default_branch: defaultBranch } });

  it("matches the branch the project was imported from", () => {
    expect(pushTargetsBranch(push("refs/heads/release"), "release")).toBe(true);
    expect(pushTargetsBranch(push("refs/heads/main"), "release")).toBe(false);
  });

  it("follows the repository's default branch when none was chosen", () => {
    expect(pushTargetsBranch(push("refs/heads/main"), null)).toBe(true);
    expect(pushTargetsBranch(push("refs/heads/dev"), null)).toBe(false);
    expect(pushTargetsBranch(push("refs/heads/trunk", "trunk"), null)).toBe(true);
  });

  it("ignores tags and malformed payloads", () => {
    expect(pushTargetsBranch(push("refs/tags/v1"), "main")).toBe(false);
    expect(pushTargetsBranch(null, "main")).toBe(false);
    expect(pushTargetsBranch({}, "main")).toBe(false);
    expect(pushTargetsBranch({ ref: 5 }, "main")).toBe(false);
  });
});

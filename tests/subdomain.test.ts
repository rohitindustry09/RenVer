import { describe, expect, it } from "vitest";
import { suggestSubdomain, validateSubdomain } from "@/lib/subdomain";

describe("suggestSubdomain", () => {
  it("slugifies names", () => {
    expect(suggestSubdomain("My Cool_App v2!")).toBe("my-cool-app-v2");
    expect(suggestSubdomain("next.js")).toBe("next-js");
    expect(suggestSubdomain("---x---")).toBe("x");
  });

  it("returns empty when nothing usable remains or the name is reserved", () => {
    expect(suggestSubdomain("!!!")).toBe("");
    expect(suggestSubdomain("Admin")).toBe("");
    expect(suggestSubdomain("")).toBe("");
  });

  it("caps the length at 63 without a trailing hyphen", () => {
    const result = suggestSubdomain(`${"a".repeat(62)} b`);
    expect(result.length).toBeLessThanOrEqual(63);
    expect(result.endsWith("-")).toBe(false);
  });
});

describe("validateSubdomain", () => {
  it("accepts and normalises a valid name", () => {
    expect(validateSubdomain("  Shop-1 ")).toEqual({ ok: true, value: "shop-1" });
  });

  it.each(["", "-shop", "shop-", "sh op", "shop.test", "sh_op", "shöp"])(
    "rejects invalid name %j",
    (name) => {
      expect(validateSubdomain(name).ok).toBe(false);
    },
  );

  it("rejects names longer than 63 characters", () => {
    expect(validateSubdomain("a".repeat(64)).ok).toBe(false);
    expect(validateSubdomain("a".repeat(63)).ok).toBe(true);
  });

  it("allows www now that domains are chosen by the user", () => {
    expect(validateSubdomain("www")).toEqual({ ok: true, value: "www" });
  });

  it.each(["api", "panel", "admin", "login", "mail"])(
    "rejects reserved name %s",
    (name) => {
      const result = validateSubdomain(name);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/reserved/i);
    },
  );
});

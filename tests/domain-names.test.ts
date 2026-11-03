import { describe, expect, it } from "vitest";
import {
  CHALLENGE_LABEL,
  buildHost,
  challengeHost,
  challengeValue,
  hostSlug,
  hostUrl,
  isLocalDomain,
  txtRecordsMatch,
  validateDomainName,
  validateHostLabel,
} from "@/lib/domain-names";

describe("validateDomainName", () => {
  it.each([
    ["example.com", "example.com"],
    ["Example.COM", "example.com"],
    ["  shop.example.co.uk  ", "shop.example.co.uk"],
    ["https://shop.example.com/path?x=1", "shop.example.com"],
    ["http://example.com:8080/", "example.com"],
    ["*.example.com", "example.com"],
    ["example.com.", "example.com"],
    ["localhost", "localhost"],
    ["apps.localhost", "apps.localhost"],
    ["xn--bcher-kva.example", "xn--bcher-kva.example"],
  ])("accepts %j as %j", (input, expected) => {
    expect(validateDomainName(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    "",
    "   ",
    "example",
    "127.0.0.1",
    "192.168.1.10",
    "exa mple.com",
    "-a.com",
    "a-.com",
    "a..com",
    "user@example.com",
    "example.c",
    `${"a".repeat(64)}.com`,
    `${"a.".repeat(130)}com`,
    "exa_mple.com",
    "http://",
  ])("rejects %j", (input) => {
    expect(validateDomainName(input).ok).toBe(false);
  });
});

describe("isLocalDomain", () => {
  it("treats localhost names as local", () => {
    expect(isLocalDomain("localhost")).toBe(true);
    expect(isLocalDomain("app.localhost")).toBe(true);
    expect(isLocalDomain("example.com")).toBe(false);
    expect(isLocalDomain("notlocalhost.com")).toBe(false);
    expect(isLocalDomain("localhost.example.com")).toBe(false);
  });
});

describe("validateHostLabel", () => {
  it("treats empty and @ as the root domain", () => {
    expect(validateHostLabel("")).toEqual({ ok: true, value: "" });
    expect(validateHostLabel(" @ ")).toEqual({ ok: true, value: "" });
  });

  it("accepts single and multi-level labels, including www", () => {
    expect(validateHostLabel("Shop")).toEqual({ ok: true, value: "shop" });
    expect(validateHostLabel("www")).toEqual({ ok: true, value: "www" });
    expect(validateHostLabel("app.eu")).toEqual({ ok: true, value: "app.eu" });
  });

  it.each(["-x", "x-", "a..b", "sh op", "x_y", "a".repeat(64), "admin", "panel"])("rejects %j", (label) => {
    expect(validateHostLabel(label).ok).toBe(false);
  });
});

describe("buildHost and hostUrl", () => {
  it("joins a label and domain, or uses the root", () => {
    expect(buildHost("example.com", "")).toBe("example.com");
    expect(buildHost("example.com", "shop")).toBe("shop.example.com");
  });

  it("uses http for local hosts and https for everything else", () => {
    expect(hostUrl("shop.localhost")).toBe("http://shop.localhost");
    expect(hostUrl("shop.example.com")).toBe("https://shop.example.com");
  });
});

describe("hostSlug", () => {
  it("makes a safe, stable, unique-per-host name", () => {
    expect(hostSlug("shop.example.com")).toBe("shop-example-com");
    expect(hostSlug("Shop.Example.com")).toBe("shop-example-com");
  });

  it("shortens very long hosts but keeps them distinct", () => {
    const a = hostSlug(`${"a".repeat(60)}.one.example.com`);
    const b = hostSlug(`${"a".repeat(60)}.two.example.com`);
    expect(a.length).toBeLessThanOrEqual(56);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  });
});

describe("ownership challenge", () => {
  it("names the TXT record and its value", () => {
    expect(CHALLENGE_LABEL).toBe("_renver-challenge");
    expect(challengeHost("example.com")).toBe("_renver-challenge.example.com");
    expect(challengeValue("abc123")).toBe("renver-verify=abc123");
  });

  it("matches when any TXT record equals the expected value", () => {
    expect(txtRecordsMatch([["v=spf1"], ["renver-verify=abc123"]], "abc123")).toBe(true);
  });

  it("joins long TXT records that were split into chunks", () => {
    expect(txtRecordsMatch([["renver-verify=", "abc123"]], "abc123")).toBe(true);
  });

  it("does not match other tokens, partial values or empty answers", () => {
    expect(txtRecordsMatch([["renver-verify=zzz"]], "abc123")).toBe(false);
    expect(txtRecordsMatch([["renver-verify=abc1234"]], "abc123")).toBe(false);
    expect(txtRecordsMatch([["xrenver-verify=abc123"]], "abc123")).toBe(false);
    expect(txtRecordsMatch([], "abc123")).toBe(false);
  });
});

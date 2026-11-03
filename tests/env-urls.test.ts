import { describe, expect, it } from "vitest";
import { isAppUrlKey, normalizeAppUrl, normalizeEnvValue, prepareAppUrls } from "@/lib/env-urls";

describe("normalizeAppUrl", () => {
  it("adds https:// to a bare hostname, with or without a path or trailing slash", () => {
    expect(normalizeAppUrl("pricify.techmonkies.com")).toBe("https://pricify.techmonkies.com");
    expect(normalizeAppUrl("  app.example.com/ ")).toBe("https://app.example.com");
    expect(normalizeAppUrl("app.example.com/shop/")).toBe("https://app.example.com/shop");
  });

  it("uses http for local and private addresses", () => {
    expect(normalizeAppUrl("localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeAppUrl("192.168.1.5:4000")).toBe("http://192.168.1.5:4000");
  });

  it("keeps a full address, only dropping a trailing slash", () => {
    expect(normalizeAppUrl("https://app.example.com/")).toBe("https://app.example.com");
    expect(normalizeAppUrl("http://app.example.com")).toBe("http://app.example.com");
  });

  it("leaves empty values and things that are not a hostname exactly as typed", () => {
    expect(normalizeAppUrl("")).toBe("");
    expect(normalizeAppUrl("not a host")).toBe("not a host");
    expect(normalizeAppUrl("justaword")).toBe("justaword");
  });
});

describe("isAppUrlKey / normalizeEnvValue", () => {
  it("recognises the usual address variables and nothing risky", () => {
    for (const key of ["SHOPIFY_APP_URL", "NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL", "AUTH_URL", "SITE_URL", "PUBLIC_URL", "BASE_URL", "APP_URL"]) {
      expect(isAppUrlKey(key)).toBe(true);
    }
    for (const key of ["DATABASE_URL", "REDIS_URL", "WEBHOOK_URL", "API_URL", "SCOPES"]) expect(isAppUrlKey(key)).toBe(false);
  });

  it("only rewrites address variables", () => {
    expect(normalizeEnvValue("SHOPIFY_APP_URL", "pricify.example.com")).toBe("https://pricify.example.com");
    expect(normalizeEnvValue("DATABASE_URL", "db.internal.example.com")).toBe("db.internal.example.com");
  });
});

describe("prepareAppUrls", () => {
  it("fixes a bare hostname and says so", () => {
    const { env, notes } = prepareAppUrls({ SHOPIFY_APP_URL: "pricify.techmonkies.com", OTHER: "x" }, "pricify.techmonkies.com");
    expect(env).toEqual({ SHOPIFY_APP_URL: "https://pricify.techmonkies.com", OTHER: "x" });
    expect(notes).toHaveLength(1);
  });

  it("fills SHOPIFY_APP_URL from the project's address for a Shopify app that lacks it", () => {
    const { env, notes } = prepareAppUrls({ SHOPIFY_API_KEY: "k" }, "pricify.techmonkies.com");
    expect(env.SHOPIFY_APP_URL).toBe("https://pricify.techmonkies.com");
    expect(notes[0]).toContain("SHOPIFY_APP_URL was not set");
  });

  it("changes nothing when the variables are already right, and does not invent one for other apps", () => {
    const right = { SHOPIFY_API_KEY: "k", SHOPIFY_APP_URL: "https://a.example.com" };
    expect(prepareAppUrls(right, "a.example.com")).toEqual({ env: right, notes: [] });
    expect(prepareAppUrls({ PORT: "3000" }, "a.example.com")).toEqual({ env: { PORT: "3000" }, notes: [] });
  });
});

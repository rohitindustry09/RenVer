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

describe("retargetAppUrls", () => {
  it("points address variables that held the old address at the new one, keeping scheme, port and path", async () => {
    const { retargetAppUrls } = await import("@/lib/env-urls");
    const result = retargetAppUrls(
      { SHOPIFY_APP_URL: "https://old.example.com", NEXTAUTH_URL: "http://old.example.com:3000/app/", SITE_URL: "https://OLD.example.com/" },
      "old.example.com",
      "new.example.com",
    );
    expect(result.env).toEqual({ SHOPIFY_APP_URL: "https://new.example.com", NEXTAUTH_URL: "http://new.example.com:3000/app", SITE_URL: "https://new.example.com" });
    expect(result.changed).toEqual(["SHOPIFY_APP_URL", "NEXTAUTH_URL", "SITE_URL"]);
  });

  it("leaves other variables and other hosts alone", async () => {
    const { retargetAppUrls } = await import("@/lib/env-urls");
    const env = { SHOPIFY_APP_URL: "https://elsewhere.example.com", DATABASE_URL: "https://old.example.com/db", API_KEY: "old.example.com", PUBLIC_URL: "https://notold.example.com" };
    const result = retargetAppUrls(env, "old.example.com", "new.example.com");
    expect(result.env).toEqual(env);
    expect(result.changed).toEqual([]);
  });
});

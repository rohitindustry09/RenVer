import { describe, expect, it } from "vitest";
import { constantTimeEqual, isSameOrigin, parseBasicAuth } from "@/lib/auth";

const headers = (entries: Record<string, string>) => ({
  get: (name: string) => entries[name.toLowerCase()] ?? null,
});

describe("parseBasicAuth", () => {
  it("extracts user and password", () => {
    const header = `Basic ${btoa("admin:p:ass")}`;
    expect(parseBasicAuth(header)).toEqual({ user: "admin", password: "p:ass" });
  });

  it("returns null for missing, wrong-scheme or malformed headers", () => {
    expect(parseBasicAuth(null)).toBeNull();
    expect(parseBasicAuth("Bearer abc")).toBeNull();
    expect(parseBasicAuth("Basic %%%not-base64%%%")).toBeNull();
    expect(parseBasicAuth(`Basic ${btoa("no-colon")}`)).toBeNull();
  });
});

describe("constantTimeEqual", () => {
  it("compares strings of any length correctly", async () => {
    expect(await constantTimeEqual("secret", "secret")).toBe(true);
    expect(await constantTimeEqual("secret", "secreT")).toBe(false);
    expect(await constantTimeEqual("secret", "secret-longer")).toBe(false);
    expect(await constantTimeEqual("", "x")).toBe(false);
  });
});

describe("isSameOrigin", () => {
  it("always allows safe methods", () => {
    expect(isSameOrigin("GET", headers({ "sec-fetch-site": "cross-site" }))).toBe(true);
  });

  it("blocks cross-site browser requests via Sec-Fetch-Site", () => {
    expect(isSameOrigin("POST", headers({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin("DELETE", headers({ "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("allows same-origin and user-initiated requests", () => {
    expect(isSameOrigin("POST", headers({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin("POST", headers({ "sec-fetch-site": "none" }))).toBe(true);
  });

  it("falls back to comparing Origin with Host", () => {
    expect(isSameOrigin("POST", headers({ origin: "https://panel.example.com", host: "panel.example.com" }))).toBe(true);
    expect(isSameOrigin("POST", headers({ origin: "https://evil.com", host: "panel.example.com" }))).toBe(false);
    expect(isSameOrigin("POST", headers({ origin: "not a url", host: "panel.example.com" }))).toBe(false);
  });

  it("allows non-browser clients that send neither header", () => {
    expect(isSameOrigin("POST", headers({}))).toBe(true);
  });
});

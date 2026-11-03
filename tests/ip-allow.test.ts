import { describe, expect, it } from "vitest";
import { isIpAllowed, parseAllowList } from "@/lib/ip-allow";

const allowed = (list: string, ip: string) => {
  const parsed = parseAllowList(list);
  if (!parsed.ok) throw new Error(parsed.error);
  return isIpAllowed(ip, parsed.rules);
};

describe("parseAllowList", () => {
  it("accepts single addresses, ranges and a mix separated by commas or spaces", () => {
    expect(parseAllowList("203.0.113.7, 10.0.0.0/8  2001:db8::1").ok).toBe(true);
  });

  it("treats an empty list as 'no restriction'", () => {
    expect(parseAllowList("")).toEqual({ ok: true, rules: [] });
    expect(parseAllowList("   ")).toEqual({ ok: true, rules: [] });
  });

  it("rejects entries it cannot understand, so a typo never silently opens or closes the panel", () => {
    for (const bad of ["not-an-ip", "300.1.1.1", "10.0.0.0/33", "10.0.0.0/x", "1.2.3"]) {
      expect(parseAllowList(bad).ok, bad).toBe(false);
    }
  });
});

describe("isIpAllowed", () => {
  it("matches exact addresses", () => {
    expect(allowed("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(allowed("203.0.113.7", "203.0.113.8")).toBe(false);
  });

  it("matches ranges", () => {
    expect(allowed("10.1.0.0/16", "10.1.200.9")).toBe(true);
    expect(allowed("10.1.0.0/16", "10.2.0.1")).toBe(false);
    expect(allowed("0.0.0.0/0", "8.8.8.8")).toBe(true);
    expect(allowed("203.0.113.7/32", "203.0.113.7")).toBe(true);
  });

  it("matches IPv6 addresses regardless of letter case, and IPv4 written the IPv6 way", () => {
    expect(allowed("2001:DB8::1", "2001:db8::1")).toBe(true);
    expect(allowed("203.0.113.7", "::ffff:203.0.113.7")).toBe(true);
  });

  it("always lets the machine itself in, so you cannot lock yourself out of a local panel", () => {
    expect(allowed("203.0.113.7", "127.0.0.1")).toBe(true);
    expect(allowed("203.0.113.7", "::1")).toBe(true);
    expect(allowed("203.0.113.7", "direct")).toBe(true);
  });

  it("refuses everything else when a list is set", () => {
    expect(allowed("203.0.113.7", "198.51.100.1")).toBe(false);
    expect(allowed("203.0.113.7", "garbage")).toBe(false);
  });

  it("lets everyone in when the list is empty", () => {
    expect(isIpAllowed("198.51.100.1", [])).toBe(true);
  });
});

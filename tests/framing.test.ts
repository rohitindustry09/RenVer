import { describe, expect, it } from "vitest";
import { allowsFraming } from "@/lib/framing";

const headers = (entries: Record<string, string>) => new Headers(entries);

describe("allowsFraming", () => {
  it("allows a site that sets no framing rules", () => {
    expect(allowsFraming(headers({}))).toBe(true);
    expect(allowsFraming(headers({ "content-type": "text/html" }))).toBe(true);
  });

  it("blocks X-Frame-Options DENY and SAMEORIGIN", () => {
    expect(allowsFraming(headers({ "x-frame-options": "DENY" }))).toBe(false);
    expect(allowsFraming(headers({ "x-frame-options": "sameorigin" }))).toBe(false);
  });

  it("blocks a frame-ancestors rule that does not allow everyone", () => {
    expect(allowsFraming(headers({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }))).toBe(false);
    expect(allowsFraming(headers({ "content-security-policy": "frame-ancestors 'self'" }))).toBe(false);
    expect(allowsFraming(headers({ "content-security-policy": "frame-ancestors https://example.com" }))).toBe(false);
  });

  it("allows a CSP with no frame-ancestors, or one that allows any source", () => {
    expect(allowsFraming(headers({ "content-security-policy": "default-src 'self'" }))).toBe(true);
    expect(allowsFraming(headers({ "content-security-policy": "frame-ancestors *" }))).toBe(true);
  });
});

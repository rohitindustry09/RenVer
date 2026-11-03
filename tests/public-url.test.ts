import { describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/public-url";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });
const INTERNAL = "http://localhost:3000/login";

describe("publicOrigin", () => {
  it("uses what the browser typed when a proxy forwards it", () => {
    expect(publicOrigin(headers({ host: "panel.example.com", "x-forwarded-proto": "https" }), INTERNAL)).toBe("https://panel.example.com");
    expect(publicOrigin(headers({ host: "127.0.0.1:3000", "x-forwarded-host": "panel.example.com", "x-forwarded-proto": "https, http" }), INTERNAL)).toBe("https://panel.example.com");
  });

  it("keeps a port, and plain http when nothing says https", () => {
    expect(publicOrigin(headers({ host: "203.0.113.5:3000" }), INTERNAL)).toBe("http://203.0.113.5:3000");
  });

  it("ignores a host header with odd characters and falls back to the server's own address", () => {
    expect(publicOrigin(headers({ host: "evil.com/x@y" }), INTERNAL)).toBe("http://localhost:3000");
    expect(publicOrigin(headers({}), "https://localhost:3000/")).toBe("https://localhost:3000");
  });
});

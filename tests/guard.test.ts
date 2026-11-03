import { afterEach, describe, expect, it, vi } from "vitest";
import { guardRequest } from "@/lib/guard";

const basic = (password: string, user = "admin") => `Basic ${btoa(`${user}:${password}`)}`;
const post = (headers: Record<string, string> = {}) => new Request("http://localhost/api/x", { method: "POST", headers });
const get = (headers: Record<string, string> = {}) => new Request("http://localhost/api/x", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("guardRequest: cross-site protection", () => {
  it("blocks state-changing requests from other sites", async () => {
    const response = await guardRequest(post({ "sec-fetch-site": "cross-site" }));
    expect(response?.status).toBe(403);
  });

  it("allows the same cross-site header on safe methods", async () => {
    expect(await guardRequest(get({ "sec-fetch-site": "cross-site" }))).toBeNull();
  });

  it("allows same-origin and non-browser requests", async () => {
    expect(await guardRequest(post({ "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(await guardRequest(post())).toBeNull();
  });
});

describe("guardRequest: password", () => {
  it("lets everything through locally when no password is set", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "");
    vi.stubEnv("RENVER_MODE", "local");
    expect(await guardRequest(get())).toBeNull();
  });

  it("refuses to run unprotected in production", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "");
    vi.stubEnv("RENVER_MODE", "production");
    const response = await guardRequest(get());
    expect(response?.status).toBe(503);
  });

  it("asks for credentials when a password is set", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const response = await guardRequest(get());
    expect(response?.status).toBe(401);
    expect(response?.headers.get("www-authenticate")).toMatch(/^Basic/);
  });

  it("rejects a wrong password and a wrong scheme", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    expect((await guardRequest(get({ authorization: basic("nope") })))?.status).toBe(401);
    expect((await guardRequest(get({ authorization: "Bearer s3cret" })))?.status).toBe(401);
    expect((await guardRequest(get({ authorization: "Basic %%%" })))?.status).toBe(401);
  });

  it("accepts the right password, whatever the username", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    expect(await guardRequest(get({ authorization: basic("s3cret") }))).toBeNull();
    expect(await guardRequest(post({ authorization: basic("s3cret", "anyone") }))).toBeNull();
  });

  it("checks cross-site protection before the password", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const response = await guardRequest(post({ authorization: basic("s3cret"), "sec-fetch-site": "cross-site" }));
    expect(response?.status).toBe(403);
  });
});

describe("guardRequest: guessing the password", () => {
  const from = (ip: string, authorization?: string) => get({ "x-forwarded-for": ip, ...(authorization ? { authorization } : {}) });

  it("refuses a client after too many wrong passwords, even if the next one is right", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (let i = 0; i < 10; i++) expect((await guardRequest(from("198.51.100.10", basic("wrong"))))?.status).toBe(401);
    const blocked = await guardRequest(from("198.51.100.10", basic("s3cret")));
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("does not block other clients", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (let i = 0; i < 10; i++) await guardRequest(from("198.51.100.11", basic("wrong")));
    expect(await guardRequest(from("198.51.100.12", basic("s3cret")))).toBeNull();
  });

  it("does not count the browser's first request, which has no credentials", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (let i = 0; i < 15; i++) expect((await guardRequest(from("198.51.100.13")))?.status).toBe(401);
    expect(await guardRequest(from("198.51.100.13", basic("s3cret")))).toBeNull();
  });

  it("starts counting again after a successful login", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (let i = 0; i < 9; i++) await guardRequest(from("198.51.100.14", basic("wrong")));
    expect(await guardRequest(from("198.51.100.14", basic("s3cret")))).toBeNull();
    for (let i = 0; i < 9; i++) expect((await guardRequest(from("198.51.100.14", basic("wrong"))))?.status).toBe(401);
  });
});

describe("guardRequest: allowed addresses", () => {
  const from = (ip: string) => get({ "x-forwarded-for": ip });

  it("refuses addresses that are not on the list, before asking for a password", async () => {
    vi.stubEnv("RENVER_ALLOWED_IPS", "203.0.113.7, 10.0.0.0/8");
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    expect((await guardRequest(from("198.51.100.1")))?.status).toBe(403);
  });

  it("lets listed addresses carry on to the normal login", async () => {
    vi.stubEnv("RENVER_ALLOWED_IPS", "203.0.113.7, 10.0.0.0/8");
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    expect((await guardRequest(from("10.4.5.6")))?.status).toBe(401);
    expect(await guardRequest(get({ "x-forwarded-for": "203.0.113.7", authorization: basic("s3cret") }))).toBeNull();
  });

  it("always lets the machine itself in", async () => {
    vi.stubEnv("RENVER_ALLOWED_IPS", "203.0.113.7");
    expect(await guardRequest(get())).toBeNull();
    expect(await guardRequest(from("127.0.0.1"))).toBeNull();
  });

  it("shuts everyone but the machine out when the list is broken, rather than opening the panel", async () => {
    vi.stubEnv("RENVER_ALLOWED_IPS", "203.0.113.7, oops");
    expect((await guardRequest(from("203.0.113.7")))?.status).toBe(403);
    expect(await guardRequest(get())).toBeNull();
  });

  it("changes nothing when no list is set", async () => {
    vi.stubEnv("RENVER_ALLOWED_IPS", "");
    expect(await guardRequest(from("198.51.100.1"))).toBeNull();
  });
});

describe("middleware matcher", () => {
  it("skips only the streaming upload routes, which guard themselves", async () => {
    const { pathToRegexp } = await import("next/dist/compiled/path-to-regexp");
    const { config } = await import("@/middleware");
    const matcher = pathToRegexp(config.matcher[0]!);
    for (const guarded of ["/", "/setup", "/api/system", "/api/projects", "/api/backups", "/api/backups/some-name", "/api/analyze/extra", "/api/import/github"]) {
      expect(matcher.test(guarded), guarded).toBe(true);
    }
    for (const selfGuarded of ["/api/analyze", "/api/backups/upload"]) {
      expect(matcher.test(selfGuarded), selfGuarded).toBe(false);
    }
  });
});

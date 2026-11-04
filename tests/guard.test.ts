import { afterEach, describe, expect, it, vi } from "vitest";
import { guardRequest } from "@/lib/guard";
import { createSessionToken } from "@/lib/session-token";

const basic = (password: string, user = "admin") => `Basic ${btoa(`${user}:${password}`)}`;
const post = (headers: Record<string, string> = {}) => new Request("http://localhost/api/x", { method: "POST", headers });
const get = (headers: Record<string, string> = {}) => new Request("http://localhost/api/x", { headers });
const page = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, { headers });
const HOUR = 3_600_000;

/** The cookie the sign-in page sets after a correct username and password. */
const signedIn = async (user = "admin", password = "s3cret", nowMs = Date.now(), lifetime = HOUR) =>
  `renver_session=${await createSessionToken(`login:${user}:${password}`, nowMs, lifetime, "login")}`;

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

describe("guardRequest: signing in", () => {
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

  it("sends a browser that is not signed in to the sign-in page, and remembers where it was going", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const home = await guardRequest(page("/"));
    expect(home?.status).toBe(307);
    expect(home?.headers.get("location")).toBe("/login");
    const deep = await guardRequest(page("/projects/abc?tab=runtime"));
    expect(deep?.headers.get("location")).toBe("/login?next=%2Fprojects%2Fabc%3Ftab%3Druntime");
  });

  it("never makes the browser show its own username and password pop-up", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (const response of [await guardRequest(page("/")), await guardRequest(get()), await guardRequest(post()), await guardRequest(get({ authorization: basic("nope") }))]) {
      expect(response?.headers.get("www-authenticate")).toBeNull();
    }
  });

  it("answers API calls and writes with a 401 that says to sign in", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (const request of [get(), post(), new Request("http://localhost/api/x", { method: "DELETE" })]) {
      const response = await guardRequest(request);
      expect(response?.status).toBe(401);
      expect(await response?.json()).toMatchObject({ login: true });
    }
  });

  it("lets a browser through that holds a valid sign-in cookie", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    expect(await guardRequest(page("/projects", { cookie: await signedIn() }))).toBeNull();
    expect(await guardRequest(get({ cookie: await signedIn() }))).toBeNull();
  });

  it("signs a cookie out once the session epoch changes (sign out everywhere)", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const old = { cookie: await signedIn() };
    expect(await guardRequest(page("/projects", old), "")).toBeNull();
    expect((await guardRequest(page("/projects", old), "epoch-2"))?.status).toBe(307);
    const fresh = await createSessionToken("login:admin:s3cret#epoch-2", Date.now(), HOUR, "login");
    expect(await guardRequest(page("/projects", { cookie: `renver_session=${fresh}` }), "epoch-2")).toBeNull();
  });

  it("refuses a cookie that is expired, forged, or made for another password or username", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (const cookie of [
      await signedIn("admin", "s3cret", Date.now() - 2 * HOUR),
      await signedIn("admin", "other-password"),
      await signedIn("root", "s3cret"),
      "renver_session=9999999999999.forged",
      "renver_session=",
      "something=else",
    ]) {
      expect((await guardRequest(page("/projects", { cookie })))?.status, cookie.slice(0, 30)).toBe(307);
    }
  });

  it("does not accept the code cookie as a sign-in cookie", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const wrong = `renver_session=${await createSessionToken("login:admin:s3cret", Date.now(), HOUR)}`; // purpose "2fa", not "login"
    expect((await guardRequest(page("/projects", { cookie: wrong })))?.status).toBe(307);
  });

  it("leaves the sign-in page and its routes reachable by someone who is not signed in", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (const path of ["/login", "/api/auth/login", "/api/auth/logout"]) {
      expect(await guardRequest(page(path)), path).toBeNull();
    }
  });

  it("still applies the cross-site rule to the sign-in routes", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const response = await guardRequest(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }));
    expect(response?.status).toBe(403);
  });
});

describe("guardRequest: username and password sent as a header (scripts)", () => {
  it("accepts the right ones", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    expect(await guardRequest(get({ authorization: basic("s3cret") }))).toBeNull();
    expect(await guardRequest(post({ authorization: basic("s3cret") }))).toBeNull();
  });

  it("checks the username too: admin by default, or RENVER_ADMIN_USER", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    expect((await guardRequest(get({ authorization: basic("s3cret", "anyone") })))?.status).toBe(401);
    vi.stubEnv("RENVER_ADMIN_USER", "rohit");
    expect(await guardRequest(get({ authorization: basic("s3cret", "rohit") }))).toBeNull();
    expect((await guardRequest(get({ authorization: basic("s3cret", "admin") })))?.status).toBe(401);
  });

  it("rejects a wrong password, a wrong scheme and garbage", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    for (const authorization of [basic("nope"), "Bearer s3cret", "Basic %%%"]) {
      expect((await guardRequest(get({ authorization })))?.status).toBe(401);
    }
  });

  it("checks cross-site protection before the password", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const response = await guardRequest(post({ authorization: basic("s3cret"), "sec-fetch-site": "cross-site" }));
    expect(response?.status).toBe(403);
  });
});

describe("guardRequest: guessing the password in a header", () => {
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

  it("does not count a request with no credentials, which is just a first visit", async () => {
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

describe("guardRequest: second factor", () => {
  const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const request = async (path: string, headers: Record<string, string> = {}, method = "GET") =>
    new Request(`http://localhost${path}`, { method, headers: { cookie: await signedIn(), ...headers } });
  const codeCookie = async (key = `${SECRET}:admin:s3cret`, nowMs = Date.now()) => `renver_2fa=${await createSessionToken(key, nowMs, 60_000)}`;
  const both = async (code: string) => `${await signedIn()}; ${code}`;
  const on = () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    vi.stubEnv("RENVER_TOTP_SECRET", SECRET);
  };

  it("sends a signed-in browser with no code to the code page", async () => {
    on();
    const response = await guardRequest(await request("/projects"));
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("/verify");
  });

  it("answers API calls and writes with 401 that says a code is needed", async () => {
    on();
    for (const response of [await guardRequest(await request("/api/projects")), await guardRequest(await request("/api/projects", {}, "DELETE"))]) {
      expect(response?.status).toBe(401);
      expect(await response?.json()).toMatchObject({ twoFactor: true });
    }
  });

  it("lets a browser through that holds both cookies", async () => {
    on();
    const cookie = await both(await codeCookie());
    expect(await guardRequest(page("/projects", { cookie }))).toBeNull();
    expect(await guardRequest(page("/api/projects", { cookie }))).toBeNull();
  });

  it("refuses a code cookie that is expired, forged, or made for another secret or sign-in", async () => {
    on();
    for (const code of [
      await codeCookie(undefined, Date.now() - 3_600_000),
      await codeCookie(`${SECRET}:admin:other-password`),
      await codeCookie("OTHER:admin:s3cret"),
      "renver_2fa=9999999999999.forged",
      "renver_2fa=",
    ]) {
      expect((await guardRequest(page("/projects", { cookie: await both(code) })))?.status, code.slice(0, 30)).toBe(307);
    }
  });

  it("asks to sign in before asking for a code: a code cookie alone is not enough", async () => {
    on();
    const response = await guardRequest(page("/projects", { cookie: await codeCookie() }));
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("leaves the code page and its routes reachable without a code, but not without signing in", async () => {
    on();
    for (const path of ["/verify", "/api/auth/verify", "/api/auth/lock"]) {
      expect(await guardRequest(await request(path)), path).toBeNull();
      expect((await guardRequest(page(path)))?.status, path).toBe(path.startsWith("/api") ? 401 : 307);
    }
  });

  it("shuts the panel instead of switching the step off when the secret is not valid", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    vi.stubEnv("RENVER_TOTP_SECRET", "not base32!");
    expect((await guardRequest(await request("/projects")))?.status).toBe(503);
  });

  it("does nothing when no secret is set", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    vi.stubEnv("RENVER_TOTP_SECRET", "");
    expect(await guardRequest(await request("/projects"))).toBeNull();
  });

  it("applies even with no password set (a local panel that only wants the code)", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "");
    vi.stubEnv("RENVER_MODE", "local");
    vi.stubEnv("RENVER_TOTP_SECRET", SECRET);
    expect((await guardRequest(page("/projects")))?.status).toBe(307);
    const cookie = `renver_2fa=${await createSessionToken(`${SECRET}:admin:`, Date.now(), 60_000)}`;
    expect(await guardRequest(page("/projects", { cookie }))).toBeNull();
  });

  it("works for scripts too: the header signs in, the code cookie still has to be there", async () => {
    on();
    expect((await guardRequest(get({ authorization: basic("s3cret") })))?.status).toBe(401);
    expect(await guardRequest(get({ authorization: basic("s3cret"), cookie: await codeCookie() }))).toBeNull();
  });
});

describe("guardRequest: allowed addresses", () => {
  const from = (ip: string) => get({ "x-forwarded-for": ip });

  it("refuses addresses that are not on the list, before anything else", async () => {
    vi.stubEnv("RENVER_ALLOWED_IPS", "203.0.113.7, 10.0.0.0/8");
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    expect((await guardRequest(from("198.51.100.1")))?.status).toBe(403);
  });

  it("lets listed addresses carry on to the normal sign-in", async () => {
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

describe("middleware: redirects", () => {
  const run = async (url: string, headers: Record<string, string> = {}) => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("@/middleware");
    return middleware(new NextRequest(url, { headers }));
  };

  it("sends a browser that is not signed in to the sign-in page with a full address (a bare path made the middleware fail)", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const response = await run("https://panel.example.com/projects");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://panel.example.com/login?next=%2Fprojects");
  });

  it("sends a signed-in browser without a code to the code page", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    vi.stubEnv("RENVER_TOTP_SECRET", "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    const response = await run("https://panel.example.com/projects", { cookie: await signedIn() });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://panel.example.com/verify");
  });

  it("still answers API calls without a redirect", async () => {
    vi.stubEnv("RENVER_ADMIN_PASSWORD", "s3cret");
    const response = await run("https://panel.example.com/api/projects");
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("middleware matcher", () => {
  it("skips only the streaming upload routes, which guard themselves", async () => {
    const { pathToRegexp } = await import("next/dist/compiled/path-to-regexp");
    const { config } = await import("@/middleware");
    const matcher = pathToRegexp(config.matcher[0]!);
    for (const guarded of ["/", "/setup", "/login", "/verify", "/api/system", "/api/projects", "/api/backups", "/api/backups/some-name", "/api/analyze/extra", "/api/import/github"]) {
      expect(matcher.test(guarded), guarded).toBe(true);
    }
    for (const selfGuarded of ["/api/analyze", "/api/backups/upload"]) {
      expect(matcher.test(selfGuarded), selfGuarded).toBe(false);
    }
  });

  it("lets the logo and tab icons load before sign-in, so the sign-in page looks right", async () => {
    const { pathToRegexp } = await import("next/dist/compiled/path-to-regexp");
    const { config } = await import("@/middleware");
    const matcher = pathToRegexp(config.matcher[0]!);
    for (const asset of ["/brand/logo.png", "/brand/logo-animated.gif", "/brand/icon-32.png", "/brand/apple-icon.png", "/favicon.ico"]) {
      expect(matcher.test(asset), asset).toBe(false);
    }
    expect(matcher.test("/brandx/secret"), "/brandx/secret").toBe(true);
  });
});

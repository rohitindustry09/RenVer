import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateAdminPassword, validateWordPressInput } from "@/lib/wordpress-input";
import { templateCapabilities, templateEnv, wordpressDockerfile, wordpressEnv, WORDPRESS_CONFIG_EXTRA } from "@/lib/wordpress-env";
import { buildInstallBody, httpSend, installWordPress, interpretInstallPage, type InstallRequest, type Sender } from "@/lib/wordpress-install";

const GOOD = { title: "  My   Shop ", adminUser: "boss", adminEmail: "boss@example.com", adminPassword: "Tr0ub4dour-Horse-Battery", language: "hi_IN", indexable: false };

describe("validateWordPressInput", () => {
  it("accepts good input and tidies the title", () => {
    const result = validateWordPressInput(GOOD);
    expect(result).toEqual({ ok: true, value: { ...GOOD, title: "My Shop" } });
  });

  it.each([
    [{ ...GOOD, title: "  " }, /title/i],
    [{ ...GOOD, title: "x".repeat(81) }, /title/i],
    [{ ...GOOD, adminUser: "a b" }, /username/i],
    [{ ...GOOD, adminUser: "ab" }, /username/i],
    [{ ...GOOD, adminEmail: "nope" }, /email/i],
    [{ ...GOOD, adminPassword: "short" }, /password|characters/i],
    [{ ...GOOD, adminPassword: "password1234" }, /password/i],
    [{ ...GOOD, adminPassword: "line\nbreak-long-password" }, /password/i],
    [{ ...GOOD, language: "xx_XX" }, /language/i],
  ])("refuses %#", (input, message) => {
    const result = validateWordPressInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });

  it("refuses a password that contains the username", () => {
    expect(validateWordPressInput({ ...GOOD, adminUser: "bossman", adminPassword: "xx-BossMan-1234567" }).ok).toBe(false);
  });

  it("defaults to English and indexable, and survives non-objects", () => {
    const { language: _l, indexable: _i, ...rest } = GOOD;
    const result = validateWordPressInput(rest);
    expect(result.ok && result.value.language === "en_US" && result.value.indexable).toBe(true);
    expect(validateWordPressInput(null).ok).toBe(false);
  });
});

describe("generateAdminPassword", () => {
  it("makes a long password that passes the rules", () => {
    let seed = 7;
    const password = generateAdminPassword((n) => (seed = (seed * 31 + 11) % 1_000_003) % n);
    expect(password).toHaveLength(20);
    expect(password).toMatch(/^[A-Za-z0-9]+$/);
    expect(validateWordPressInput({ ...GOOD, adminPassword: password }).ok).toBe(true);
  });
});

describe("wordpress-env", () => {
  it("builds a Dockerfile on the official image", () => {
    const dockerfile = wordpressDockerfile();
    expect(dockerfile).toMatch(/^FROM wordpress:php/);
    expect(dockerfile).toContain("upload_max_filesize");
  });

  it("maps the database to WordPress settings and keeps DATABASE_URL for linking", () => {
    const env = wordpressEnv({ host: "renver-db-wp", port: 3306, database: "wp", username: "u_wp", password: "pw", connectionUrl: "mysql://u_wp:pw@renver-db-wp:3306/wp" });
    expect(env).toMatchObject({ WORDPRESS_DB_HOST: "renver-db-wp:3306", WORDPRESS_DB_NAME: "wp", WORDPRESS_DB_USER: "u_wp", WORDPRESS_DB_PASSWORD: "pw", DATABASE_URL: "mysql://u_wp:pw@renver-db-wp:3306/wp" });
    expect(env.WORDPRESS_CONFIG_EXTRA).toBe(WORDPRESS_CONFIG_EXTRA);
  });

  it("only adds RENVER_HOSTS for WordPress projects, without changing the input", () => {
    const base = { A: "1" };
    expect(templateEnv(base, "wordpress", ["a.com", "www.a.com"])).toEqual({ A: "1", RENVER_HOSTS: "a.com,www.a.com" });
    expect(templateEnv(base, undefined, ["a.com"])).toBe(base);
    expect(base).toEqual({ A: "1" });
  });
});

describe("templateCapabilities", () => {
  it("gives WordPress what its image needs and nothing to other projects", () => {
    expect(templateCapabilities("wordpress")).toEqual(["DAC_OVERRIDE", "FOWNER", "KILL"]);
    expect(templateCapabilities(undefined)).toEqual([]);
  });
});

const REQUEST: InstallRequest = { port: 1, host: "shop.example.com", https: true, title: "My Shop", adminUser: "boss", adminEmail: "boss@example.com", adminPassword: "p&ss=word 1", language: "en_US", indexable: true };

describe("install page", () => {
  it("encodes the form and only sends blog_public when hiding the site", () => {
    const body = new URLSearchParams(buildInstallBody(REQUEST));
    expect(body.get("admin_password")).toBe("p&ss=word 1");
    expect(body.get("admin_password2")).toBe("p&ss=word 1");
    expect(body.has("blog_public")).toBe(false);
    expect(new URLSearchParams(buildInstallBody({ ...REQUEST, indexable: false })).get("blog_public")).toBe("0");
  });

  it("understands WordPress' answers", () => {
    expect(interpretInstallPage(200, "<h1>Success!</h1>")).toEqual({ ok: true, alreadyInstalled: false });
    expect(interpretInstallPage(200, "<h1>Already Installed</h1>")).toEqual({ ok: true, alreadyInstalled: true });
    expect(interpretInstallPage(500, "Error establishing a database connection")).toMatchObject({ ok: false, retry: true });
    expect(interpretInstallPage(200, '<p class="message">Please <b>provide</b> a valid email address.</p>')).toEqual({ ok: false, error: "Please provide a valid email address.", retry: false });
    expect(interpretInstallPage(502, "bad gateway")).toMatchObject({ ok: false, retry: true });
    expect(interpretInstallPage(200, "<html></html>")).toMatchObject({ ok: false, retry: false });
  });
});

describe("installWordPress", () => {
  const noWait = async () => undefined;

  it("posts to the install step with the public host and protocol", async () => {
    const seen: Parameters<Sender>[0][] = [];
    const send: Sender = async (options) => {
      seen.push(options);
      return { status: 200, body: "<h1>Success!</h1>" };
    };
    expect(await installWordPress(REQUEST, send, noWait)).toEqual({ ok: true, alreadyInstalled: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ port: 1, method: "POST", path: "/wp-admin/install.php?step=2" });
    expect(seen[0].headers).toMatchObject({ Host: "shop.example.com", "X-Forwarded-Proto": "https" });
  });

  it("retries while WordPress is still starting, then succeeds", async () => {
    let calls = 0;
    const send: Sender = async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      if (calls === 2) return { status: 500, body: "Error establishing a database connection" };
      return { status: 200, body: "<h1>Success</h1>" };
    };
    expect((await installWordPress(REQUEST, send, noWait)).ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("stops at once on an answer that will not change, and gives up after repeated failures", async () => {
    let calls = 0;
    const refusing: Sender = async () => {
      calls++;
      return { status: 200, body: '<p class="message">Bad email.</p>' };
    };
    expect(await installWordPress(REQUEST, refusing, noWait)).toMatchObject({ ok: false, error: "Bad email." });
    expect(calls).toBe(1);

    calls = 0;
    const down: Sender = async () => {
      calls++;
      throw new Error("down");
    };
    expect(await installWordPress(REQUEST, down, noWait)).toMatchObject({ ok: false, error: "down" });
    expect(calls).toBe(6);
  });

  it("never puts the password in an error", async () => {
    const send: Sender = async () => ({ status: 200, body: '<p class="message">Nope.</p>' });
    const outcome = await installWordPress(REQUEST, send, noWait);
    expect(JSON.stringify(outcome)).not.toContain(REQUEST.adminPassword);
  });
});

describe("httpSend", () => {
  let server: http.Server;
  let port = 0;
  let received: { host?: string; proto?: string; body: string } = { body: "" };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        received = { host: req.headers.host, proto: String(req.headers["x-forwarded-proto"]), body };
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Success!</h1>");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("sends the Host header it is given (a real round trip)", async () => {
    const outcome = await installWordPress({ ...REQUEST, port }, httpSend, async () => undefined);
    expect(outcome).toEqual({ ok: true, alreadyInstalled: false });
    expect(received.host).toBe("shop.example.com");
    expect(received.proto).toBe("https");
    expect(new URLSearchParams(received.body).get("user_name")).toBe("boss");
  });
});

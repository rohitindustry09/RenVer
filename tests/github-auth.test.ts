import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-gh-"));
process.env.RENVER_DATA_DIR = dataDir;
delete process.env.RENVER_GITHUB_TOKEN;

const globalDb = globalThis as { __renverDb?: { close(): void } };
afterAll(() => {
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const load = () => import("@/lib/github-auth");
const TOKEN = `ghp_${"a1B2c3D4e5".repeat(4)}`;

const reply = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("gitAuthEnv", () => {
  it("sends the token through git's environment, never the command line or a URL", async () => {
    const { gitAuthEnv } = await load();
    expect(gitAuthEnv(null)).toEqual({});
    const env = gitAuthEnv(TOKEN);
    expect(env.GIT_CONFIG_COUNT).toBe("1");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
    const encoded = env.GIT_CONFIG_VALUE_0!.replace("AUTHORIZATION: basic ", "");
    expect(Buffer.from(encoded, "base64").toString()).toBe(`x-access-token:${TOKEN}`);
  });
});

describe("verifyGithubToken", () => {
  it("returns the account name for a good token", async () => {
    const { verifyGithubToken } = await load();
    expect(await verifyGithubToken(TOKEN, reply(200, { login: "octo" }))).toEqual({ ok: true, login: "octo" });
  });

  it("explains a rejected token, a GitHub error and an unreachable GitHub", async () => {
    const { verifyGithubToken } = await load();
    const rejected = await verifyGithubToken(TOKEN, reply(401));
    expect(rejected.ok === false && rejected.error).toContain("did not accept");
    expect((await verifyGithubToken(TOKEN, reply(500))).ok).toBe(false);
    const offline = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const unreachable = await verifyGithubToken(TOKEN, offline);
    expect(unreachable.ok === false && unreachable.error).toContain("Could not reach GitHub");
  });
});

describe("saved token", () => {
  it("is stored encrypted, read back, and removable", async () => {
    const { clearGithubToken, getGithubToken, githubConnection, saveGithubToken } = await load();
    expect(githubConnection()).toEqual({ connected: false, login: null, source: null });
    saveGithubToken(TOKEN, "octo");
    expect(getGithubToken()).toBe(TOKEN);
    expect(githubConnection()).toEqual({ connected: true, login: "octo", source: "settings" });
    const { getSetting } = await import("@/lib/db");
    expect(getSetting("github_token")).not.toContain(TOKEN);
    clearGithubToken();
    expect(getGithubToken()).toBeNull();
  });
});

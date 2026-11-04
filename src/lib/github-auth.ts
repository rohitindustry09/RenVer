import { getSetting, setSetting } from "./db";
import { decryptEnv, encryptEnv } from "./secrets";

const TOKEN_KEY = "github_token";
const LOGIN_KEY = "github_login";
const VERIFY_TIMEOUT_MS = 10_000;
const API_USER = "https://api.github.com/user";

/** The saved token, or RENVER_GITHUB_TOKEN from the settings file. Never sent to the browser. */
export function getGithubToken(): string | null {
  const saved = decryptEnv(getSetting(TOKEN_KEY)).TOKEN;
  return saved || process.env.RENVER_GITHUB_TOKEN?.trim() || null;
}

export interface GithubConnection {
  connected: boolean;
  login: string | null;
  /** "settings" when connected on the Settings page, "env" when it comes from RENVER_GITHUB_TOKEN. */
  source: "settings" | "env" | null;
}

export function githubConnection(): GithubConnection {
  if (decryptEnv(getSetting(TOKEN_KEY)).TOKEN) return { connected: true, login: getSetting(LOGIN_KEY), source: "settings" };
  if (process.env.RENVER_GITHUB_TOKEN?.trim()) return { connected: true, login: null, source: "env" };
  return { connected: false, login: null, source: null };
}

export function saveGithubToken(token: string, login: string): void {
  setSetting(TOKEN_KEY, encryptEnv({ TOKEN: token }));
  setSetting(LOGIN_KEY, login);
}

export function clearGithubToken(): void {
  setSetting(TOKEN_KEY, null);
  setSetting(LOGIN_KEY, null);
}

/**
 * Git settings that make a clone send the token. They go in through the environment (GIT_CONFIG_*), not the command line,
 * so the token never shows up in the process list, in the cloned folder's config, or in a URL.
 */
export function gitAuthEnv(token: string | null): Record<string, string> {
  if (!token) return {};
  const credentials = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${credentials}`,
  };
}

export type TokenCheck = { ok: true; login: string } | { ok: false; error: string };

/** Asks GitHub who the token belongs to. `fetcher` is injectable for tests. */
export async function verifyGithubToken(token: string, fetcher: typeof fetch = fetch): Promise<TokenCheck> {
  try {
    const response = await fetcher(API_USER, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "RenVer", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (response.status === 401) return { ok: false, error: "GitHub did not accept this token. It may be wrong, expired or revoked." };
    if (!response.ok) return { ok: false, error: `GitHub answered with an error (${response.status}). Try again in a moment.` };
    const body = (await response.json()) as { login?: unknown };
    return typeof body.login === "string" ? { ok: true, login: body.login } : { ok: false, error: "GitHub did not say who this token belongs to." };
  } catch {
    return { ok: false, error: "Could not reach GitHub from this server. Check its internet connection." };
  }
}

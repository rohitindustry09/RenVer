/**
 * The cookies that prove someone signed in ("login") or entered a two-factor code ("2fa"): "<expiry in ms>.<signature>".
 * Signed with HMAC-SHA256, so they cannot be made or lengthened without the key, and each is only good for its own
 * purpose. Web Crypto only, so the middleware (Edge) can check them.
 */

const encoder = new TextEncoder();
const DEFAULT_PURPOSE = "2fa";

async function sign(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compares without stopping at the first different character. */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function createSessionToken(key: string, nowMs: number, lifetimeMs: number, purpose: string = DEFAULT_PURPOSE): Promise<string> {
  const expires = String(nowMs + lifetimeMs);
  return `${expires}.${await sign(key, `${purpose}.${expires}`)}`;
}

export async function verifySessionToken(key: string, token: string, nowMs: number, purpose: string = DEFAULT_PURPOSE): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]!) || !parts[1]) return false;
  const [expires, signature] = parts as [string, string];
  if (!sameText(signature, await sign(key, `${purpose}.${expires}`))) return false;
  return Number(expires) > nowMs;
}

/**
 * One-time codes from an authenticator app (RFC 6238: HMAC-SHA1, 6 digits, 30 second steps).
 * Uses only Web Crypto, so it runs in the middleware (Edge) as well as in routes.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const DRIFT_STEPS = 1;
const SECRET_BYTES = 20;
const CODE_PATTERN = /^\d{6}$/;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Reads base32 the way people copy it: any case, with spaces, dashes or "=" padding. Null if it is not base32. */
export function base32Decode(text: string): Uint8Array | null {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  if (!clean) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A fresh secret to put in an authenticator app (160 random bits, as recommended). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

async function codeForStep(key: Uint8Array, step: number): Promise<string> {
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step));
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counter));
  const offset = mac[mac.length - 1]! & 15;
  const binary = ((mac[offset]! & 127) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

const stepAt = (nowMs: number): number => Math.floor(nowMs / 1000 / STEP_SECONDS);

/** The code an authenticator app shows for this secret at this moment. */
export async function totpCode(secret: string, nowMs: number): Promise<string> {
  const key = base32Decode(secret);
  if (!key) throw new Error("The two-factor secret is not valid base32.");
  return codeForStep(key, stepAt(nowMs));
}

/** Compares without stopping at the first different character. */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Checks a typed code, allowing one step of clock drift either way. `afterStep` is the step of the last accepted code:
 * anything at or before it is refused, so a code someone watched you type cannot be used again.
 */
export async function verifyTotp(
  secret: string,
  typed: string,
  nowMs: number,
  options: { afterStep?: number } = {},
): Promise<{ ok: boolean; step?: number }> {
  const key = base32Decode(secret);
  const code = typed.replace(/\s/g, "");
  if (!key || !CODE_PATTERN.test(code)) return { ok: false };
  const now = stepAt(nowMs);
  let matched: number | undefined;
  for (let step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step++) {
    if (step <= (options.afterStep ?? -1)) continue;
    // Every step is checked, so the time taken does not reveal which one matched.
    if (sameText(await codeForStep(key, step), code) && matched === undefined) matched = step;
  }
  return matched === undefined ? { ok: false } : { ok: true, step: matched };
}

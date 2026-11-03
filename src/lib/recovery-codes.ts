import { base32Encode } from "./totp.ts";

/** One-time codes for when the authenticator app is lost. Worked out from the two-factor secret, so nothing is stored. */
export const RECOVERY_CODE_COUNT = 8;
const CODE_BYTES = 7; // 7 bytes -> 12 base32 characters, trimmed to 10
const CODE_CHARS = 10;
const GROUP = 5;

const encoder = new TextEncoder();

async function codeAt(secret: string, index: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`recovery-code-${index}`)));
  return base32Encode(mac.slice(0, CODE_BYTES)).slice(0, CODE_CHARS);
}

/** Uppercase letters and digits only, so "abcde-fghij" and "ABCDEFGHIJ" are the same code. */
export const normalizeRecoveryCode = (text: string): string => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The codes in display form (XXXXX-XXXXX). */
export async function recoveryCodes(secret: string): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = await codeAt(secret, i);
    codes.push(`${code.slice(0, GROUP)}-${code.slice(GROUP)}`);
  }
  return codes;
}

/** The normalized code if the text is one of this secret's recovery codes, else null. */
export async function matchRecoveryCode(secret: string, text: string): Promise<string | null> {
  const wanted = normalizeRecoveryCode(text);
  if (wanted.length !== CODE_CHARS) return null;
  let found: string | null = null;
  for (const code of await recoveryCodes(secret)) {
    const normal = normalizeRecoveryCode(code);
    // Every code is compared, so the time taken does not say how close a guess was.
    if (normal === wanted) found = normal;
  }
  return found;
}

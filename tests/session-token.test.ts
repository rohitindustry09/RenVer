import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/session-token";

const HOUR = 3_600_000;
const KEY = "totp-secret:admin-password";
const NOW = 1_800_000_000_000;

describe("session token", () => {
  it("is accepted until it expires, and not after", async () => {
    const token = await createSessionToken(KEY, NOW, 12 * HOUR);
    expect(await verifySessionToken(KEY, token, NOW)).toBe(true);
    expect(await verifySessionToken(KEY, token, NOW + 12 * HOUR - 1)).toBe(true);
    expect(await verifySessionToken(KEY, token, NOW + 12 * HOUR + 1)).toBe(false);
  });

  it("is refused under a different key, so changing the password or secret signs everyone out", async () => {
    const token = await createSessionToken(KEY, NOW, HOUR);
    expect(await verifySessionToken("other-key", token, NOW)).toBe(false);
  });

  it("cannot be given a longer life by editing the expiry", async () => {
    const token = await createSessionToken(KEY, NOW, HOUR);
    const [, signature] = token.split(".");
    expect(await verifySessionToken(KEY, `${NOW + 100 * HOUR}.${signature}`, NOW)).toBe(false);
  });

  it("is refused when it is missing, empty, or not in the right shape", async () => {
    for (const bad of ["", "abc", ".", "123.", ".abc", "12.34.56", "x.y"]) {
      expect(await verifySessionToken(KEY, bad, NOW), bad).toBe(false);
    }
  });

  it("is only good for the purpose it was made for, so a sign-in cookie cannot stand in for a code cookie", async () => {
    const login = await createSessionToken(KEY, NOW, HOUR, "login");
    expect(await verifySessionToken(KEY, login, NOW, "login")).toBe(true);
    expect(await verifySessionToken(KEY, login, NOW)).toBe(false);
    expect(await verifySessionToken(KEY, login, NOW, "2fa")).toBe(false);
    const code = await createSessionToken(KEY, NOW, HOUR);
    expect(await verifySessionToken(KEY, code, NOW, "login")).toBe(false);
  });

  it("is different each time it is made", async () => {
    expect(await createSessionToken(KEY, NOW, HOUR)).not.toBe(await createSessionToken(KEY, NOW + 1000, HOUR));
  });
});

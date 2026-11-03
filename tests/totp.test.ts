import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotp } from "@/lib/totp";

// RFC 6238 test secret: the ASCII string "12345678901234567890", written in base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const at = (seconds: number) => seconds * 1000;

describe("base32", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 7, 8]);
    expect([...(base32Decode(base32Encode(bytes)) ?? [])]).toEqual([...bytes]);
  });

  it("reads the usual spellings: lower case, spaces and padding", () => {
    expect(base32Decode("gezd gnbv GY3T QOJQ====")).toEqual(base32Decode("GEZDGNBVGY3TQOJQ"));
  });

  it("rejects anything that is not base32", () => {
    expect(base32Decode("not base32!")).toBeNull();
    expect(base32Decode("")).toBeNull();
    expect(base32Decode("1890")).toBeNull();
  });
});

describe("totpCode (RFC 6238, SHA-1, 6 digits)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("at %i seconds the code is %s", async (seconds, expected) => {
    expect(await totpCode(RFC_SECRET, at(seconds))).toBe(expected);
  });

  it("does not change inside one 30-second step, and changes at the next", async () => {
    expect(await totpCode(RFC_SECRET, at(60))).toBe(await totpCode(RFC_SECRET, at(89)));
    expect(await totpCode(RFC_SECRET, at(89))).not.toBe(await totpCode(RFC_SECRET, at(90)));
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and reports its step", async () => {
    const code = await totpCode(RFC_SECRET, at(1234567890));
    expect(await verifyTotp(RFC_SECRET, code, at(1234567890))).toEqual({ ok: true, step: Math.floor(1234567890 / 30) });
  });

  it("allows one step of clock drift either way, but not more", async () => {
    const code = await totpCode(RFC_SECRET, at(1000));
    expect((await verifyTotp(RFC_SECRET, code, at(1000 + 30))).ok).toBe(true);
    expect((await verifyTotp(RFC_SECRET, code, at(1000 - 30))).ok).toBe(true);
    expect((await verifyTotp(RFC_SECRET, code, at(1000 + 90))).ok).toBe(false);
  });

  it("refuses a code that was already used, so a seen code cannot be replayed", async () => {
    const code = await totpCode(RFC_SECRET, at(5000));
    const first = await verifyTotp(RFC_SECRET, code, at(5000));
    expect(first.ok).toBe(true);
    expect((await verifyTotp(RFC_SECRET, code, at(5000), { afterStep: first.step })).ok).toBe(false);
  });

  it("refuses wrong, malformed or empty codes and a bad secret", async () => {
    for (const bad of ["000000", "12345", "1234567", "abcdef", "", " 287082x"]) {
      expect((await verifyTotp(RFC_SECRET, bad, at(59))).ok, bad).toBe(false);
    }
    expect((await verifyTotp("not base32!", "287082", at(59))).ok).toBe(false);
  });

  it("ignores spaces typed inside a code", async () => {
    expect((await verifyTotp(RFC_SECRET, "287 082", at(59))).ok).toBe(true);
  });
});

describe("generateTotpSecret", () => {
  it("makes a long random secret that decodes, and a different one each time", () => {
    const a = generateTotpSecret();
    expect(base32Decode(a)?.length).toBe(20);
    expect(generateTotpSecret()).not.toBe(a);
  });
});

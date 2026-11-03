import { describe, expect, it } from "vitest";
import { RECOVERY_CODE_COUNT, matchRecoveryCode, normalizeRecoveryCode, recoveryCodes } from "@/lib/recovery-codes";

const SECRET = "JBSWY3DPEHPK3PXP";

describe("recovery codes", () => {
  it("makes the same distinct codes for the same secret, and other codes for another secret", async () => {
    const codes = await recoveryCodes(SECRET);
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    expect(codes.every((c) => /^[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(c))).toBe(true);
    expect(await recoveryCodes(SECRET)).toEqual(codes);
    expect(await recoveryCodes("MFRGGZDFMZTWQ2LK")).not.toEqual(codes);
  });

  it("accepts a code in any case, with or without the dash, and nothing else", async () => {
    const [first] = await recoveryCodes(SECRET);
    expect(await matchRecoveryCode(SECRET, first!)).toBe(normalizeRecoveryCode(first!));
    expect(await matchRecoveryCode(SECRET, first!.toLowerCase().replace("-", " "))).toBe(normalizeRecoveryCode(first!));
    expect(await matchRecoveryCode(SECRET, "AAAAA-AAAAA")).toBeNull();
    expect(await matchRecoveryCode(SECRET, "123456")).toBeNull();
    expect(await matchRecoveryCode(SECRET, "")).toBeNull();
  });
});

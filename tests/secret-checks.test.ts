import { describe, expect, it } from "vitest";
import { secretWarnings } from "@/lib/secret-checks";

const STRONG = "k7Q-m2Xv9Lr4Tz8wBn5Y";
const OTHER = "p3Hd-6Fs1Jc0Wq7Eu9Ao";
const ids = (input: Parameters<typeof secretWarnings>[0]) => secretWarnings(input).map((w) => w.id);

describe("secretWarnings", () => {
  it("says nothing about a strong, separate set of secrets", () => {
    expect(ids({ password: STRONG, passphrase: OTHER, username: "admin" })).toEqual([]);
  });

  it("warns about a short panel password", () => {
    expect(ids({ password: "Sh0rt-pw", username: "admin" })).toContain("password-short");
    expect(ids({ password: "exactly12chr", username: "admin" })).not.toContain("password-short");
  });

  it("warns about a well-known or lazy password, whatever its length", () => {
    for (const weak of ["password1234", "administrator", "changemechangeme", "aaaaaaaaaaaaaaaa", "123456789012", "qwertyuiop12"]) {
      expect(ids({ password: weak, username: "admin" }), weak).toContain("password-common");
    }
  });

  it("warns when the password is the username or contains it", () => {
    expect(ids({ password: "admin", username: "admin" })).toContain("password-username");
    expect(ids({ password: "admin-admin-2026", username: "admin" })).toContain("password-username");
  });

  it("warns when the backup passphrase is the panel password: one leak would open both", () => {
    expect(ids({ password: STRONG, passphrase: STRONG, username: "admin" })).toContain("passphrase-reused");
    expect(ids({ password: STRONG, passphrase: OTHER, username: "admin" })).not.toContain("passphrase-reused");
  });

  it("warns about a short backup passphrase, but only when one is set", () => {
    expect(ids({ password: STRONG, passphrase: "short one", username: "admin" })).toContain("passphrase-short");
    expect(ids({ password: STRONG, passphrase: undefined, username: "admin" })).not.toContain("passphrase-short");
  });

  it("does not warn about a missing password (the panel has its own message for that)", () => {
    expect(ids({ password: undefined, username: "admin" })).toEqual([]);
  });

  it("never puts a secret in a message", () => {
    const all = secretWarnings({ password: "admin", passphrase: "admin", username: "admin" }).map((w) => w.message).join(" ");
    expect(all).not.toMatch(/admin\s*(is|was)\b.*admin/);
    for (const w of secretWarnings({ password: "Sh0rt-pw", passphrase: "Sh0rt-pw", username: "root" })) expect(w.message).not.toContain("Sh0rt-pw");
  });
});

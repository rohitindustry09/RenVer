import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson, loadMasterKey } from "@/lib/crypto";

const key = Buffer.alloc(32, 7);

describe("crypto", () => {
  it("round-trips a value", () => {
    const secret = { SHOPIFY_API_KEY: "abc", PASSWORD: "p@ss w0rd!" };
    expect(decryptJson(encryptJson(secret, key), key)).toEqual(secret);
  });

  it("produces different ciphertext each time", () => {
    expect(encryptJson({ a: 1 }, key)).not.toBe(encryptJson({ a: 1 }, key));
  });

  it("does not leak plaintext in the output", () => {
    expect(encryptJson({ token: "super-secret-value" }, key)).not.toContain("super-secret-value");
  });

  it("fails with the wrong key", () => {
    const wrong = Buffer.alloc(32, 9);
    expect(() => decryptJson(encryptJson({ a: 1 }, key), wrong)).toThrow();
  });

  it("detects tampering", () => {
    const encrypted = encryptJson({ a: 1 }, key);
    const tampered = `${encrypted.slice(0, -4)}AAAA`;
    expect(() => decryptJson(tampered, key)).toThrow();
  });

  it("generates a key file once and rejects a corrupt one", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-key-"));
    try {
      const first = loadMasterKey(dir);
      expect(first).toHaveLength(32);
      expect(loadMasterKey(dir).equals(first)).toBe(true);
      fs.writeFileSync(path.join(dir, "secret.key"), "dG9vc2hvcnQ=");
      expect(() => loadMasterKey(dir)).toThrow(/32 bytes/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a key of the wrong length", () => {
    expect(() => encryptJson({ a: 1 }, Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});

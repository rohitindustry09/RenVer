import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptFile, encryptFile, isEncryptedFile } from "@/lib/backup-crypto";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-crypto-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const file = (name: string, content: Buffer | string) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};

describe("encryptFile / decryptFile", () => {
  it("round-trips a large file exactly", async () => {
    const original = randomBytes(3 * 1024 * 1024 + 17);
    const plain = file("plain.bin", original);
    const enc = path.join(dir, "plain.enc");
    await encryptFile(plain, enc, "correct horse battery staple");
    const out = path.join(dir, "out.bin");
    await decryptFile(enc, out, "correct horse battery staple");
    expect(fs.readFileSync(out).equals(original)).toBe(true);
  });

  it("round-trips an empty file", async () => {
    const plain = file("empty.bin", "");
    const enc = path.join(dir, "empty.enc");
    await encryptFile(plain, enc, "pw");
    const out = path.join(dir, "out.bin");
    await decryptFile(enc, out, "pw");
    expect(fs.readFileSync(out).length).toBe(0);
  });

  it("does not leave the readable content in the encrypted file", async () => {
    const plain = file("secret.txt", "TOP-SECRET-MARKER ".repeat(1000));
    const enc = path.join(dir, "secret.enc");
    await encryptFile(plain, enc, "pw");
    expect(fs.readFileSync(enc).includes("TOP-SECRET-MARKER")).toBe(false);
  });

  it("makes a different file every time, even for the same content and passphrase", async () => {
    const plain = file("a.txt", "same content");
    await encryptFile(plain, path.join(dir, "1.enc"), "pw");
    await encryptFile(plain, path.join(dir, "2.enc"), "pw");
    expect(fs.readFileSync(path.join(dir, "1.enc")).equals(fs.readFileSync(path.join(dir, "2.enc")))).toBe(false);
  });

  it("refuses a wrong passphrase and writes nothing", async () => {
    const plain = file("a.txt", "hello");
    const enc = path.join(dir, "a.enc");
    await encryptFile(plain, enc, "right");
    const out = path.join(dir, "out.txt");
    await expect(decryptFile(enc, out, "wrong")).rejects.toThrow(/passphrase/i);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("refuses a file that was changed after it was encrypted", async () => {
    const plain = file("a.txt", "hello world, this is a backup".repeat(100));
    const enc = path.join(dir, "a.enc");
    await encryptFile(plain, enc, "pw");
    const bytes = fs.readFileSync(enc);
    bytes[bytes.length - 40] = bytes[bytes.length - 40]! ^ 0xff;
    fs.writeFileSync(enc, bytes);
    const out = path.join(dir, "out.txt");
    await expect(decryptFile(enc, out, "pw")).rejects.toThrow(/passphrase|damaged/i);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("refuses a file that is not one of ours, and an empty passphrase", async () => {
    const junk = file("junk.enc", "not encrypted by us at all, just text");
    await expect(decryptFile(junk, path.join(dir, "o"), "pw")).rejects.toThrow(/not an encrypted/i);
    await expect(encryptFile(file("x", "y"), path.join(dir, "x.enc"), "")).rejects.toThrow(/passphrase/i);
  });
});

describe("isEncryptedFile", () => {
  it("recognises our files by their header and nothing else", async () => {
    const plain = file("a.txt", "hello");
    const enc = path.join(dir, "a.enc");
    await encryptFile(plain, enc, "pw");
    expect(isEncryptedFile(enc)).toBe(true);
    expect(isEncryptedFile(plain)).toBe(false);
    expect(isEncryptedFile(path.join(dir, "missing"))).toBe(false);
    expect(isEncryptedFile(file("tiny", "x"))).toBe(false);
  });
});

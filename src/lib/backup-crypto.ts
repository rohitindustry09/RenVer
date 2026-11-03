import { createCipheriv, createDecipheriv, randomBytes, scrypt, type ScryptOptions } from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Passphrase encryption for backup files, so a copied or leaked backup is unreadable without the passphrase.
 * AES-256-GCM (it also detects any change to the file), with the key made from the passphrase by scrypt.
 * Dependency-free on purpose: the restore command must work when nothing else does.
 *
 * File layout: MAGIC | salt (16) | iv (12) | encrypted bytes | auth tag (16)
 */

const MAGIC = Buffer.from("RVBK1\n", "latin1");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;
const SCRYPT: ScryptOptions = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

export const WRONG_PASSPHRASE = "The passphrase is wrong, or the backup file is damaged.";
const NOT_ENCRYPTED = "This file is not an encrypted RenVer backup.";

const deriveKey = (passphrase: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(passphrase, salt, KEY_BYTES, SCRYPT, (error, key) => (error ? reject(error) : resolve(key))));

function requirePassphrase(passphrase: string): void {
  if (!passphrase) throw new Error("A backup passphrase is required.");
}

/** Whether a file starts with our header. Anything unreadable simply is not. */
export function isEncryptedFile(file: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(MAGIC.length);
    return fs.readSync(fd, head, 0, head.length, 0) === head.length && head.equals(MAGIC);
  } catch {
    return false;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

export async function encryptFile(source: string, destination: string, passphrase: string): Promise<void> {
  requirePassphrase(passphrase);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", await deriveKey(passphrase, salt), iv);
  cipher.setAAD(MAGIC);
  try {
    fs.writeFileSync(destination, Buffer.concat([MAGIC, salt, iv]), { mode: 0o600 });
    await pipeline(fs.createReadStream(source), cipher, fs.createWriteStream(destination, { flags: "a" }));
    fs.appendFileSync(destination, cipher.getAuthTag());
  } catch (error) {
    fs.rmSync(destination, { force: true });
    throw error;
  }
}

/** Decrypts to `destination`. If the passphrase is wrong or the file was changed, nothing is left behind. */
export async function decryptFile(source: string, destination: string, passphrase: string): Promise<void> {
  requirePassphrase(passphrase);
  const size = fs.statSync(source).size;
  if (size < HEADER_BYTES + TAG_BYTES || !isEncryptedFile(source)) throw new Error(NOT_ENCRYPTED);

  const fd = fs.openSync(source, "r");
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    fs.readSync(fd, header, 0, HEADER_BYTES, 0);
    fs.readSync(fd, tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    fs.closeSync(fd);
  }

  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = header.subarray(MAGIC.length + SALT_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", await deriveKey(passphrase, salt), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);

  const partial = `${destination}.partial`;
  try {
    // An empty original encrypts to just the header and tag, so there may be no encrypted bytes between them.
    const hasBody = size - TAG_BYTES - HEADER_BYTES > 0;
    const input = hasBody ? fs.createReadStream(source, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }) : Readable.from([]);
    await pipeline(input, decipher, fs.createWriteStream(partial, { mode: 0o600 }));
    fs.renameSync(partial, destination);
  } catch {
    fs.rmSync(partial, { force: true });
    throw new Error(WRONG_PASSPHRASE);
  }
}

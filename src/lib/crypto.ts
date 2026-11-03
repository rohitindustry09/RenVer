import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Encryption key must be ${KEY_BYTES} bytes.`);
  }
}

export function encryptJson(value: unknown, key: Buffer): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decryptJson<T = unknown>(payload: string, key: Buffer): T {
  assertKey(key);
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const data = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const text = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(text) as T;
}

/** Loads the master key from RENVER_SECRET (base64) or a generated key file in the data dir. */
export function loadMasterKey(dataDir: string): Buffer {
  const fromEnv = process.env.RENVER_SECRET;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    assertKey(key);
    return key;
  }
  const keyPath = path.join(dataDir, "secret.key");
  if (fs.existsSync(keyPath)) {
    const stored = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64");
    assertKey(stored);
    return stored;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(KEY_BYTES);
  fs.writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  return key;
}

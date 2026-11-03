import { config } from "./config";
import { decryptJson, encryptJson, loadMasterKey } from "./crypto";

export type EnvVars = Record<string, string>;

/** Kept on globalThis so every loaded copy of this module sees a reset, not just the one that did the restore. */
const globalKey = globalThis as typeof globalThis & { __renverMasterKey?: Buffer | null };

function key(): Buffer {
  globalKey.__renverMasterKey ??= loadMasterKey(config.dataDir);
  return globalKey.__renverMasterKey;
}

/** Forgets the cached key, so the next use reads secret.key again (after a restore replaced it). */
export function resetMasterKey(): void {
  globalKey.__renverMasterKey = null;
}

export function encryptEnv(env: EnvVars): string | null {
  return Object.keys(env).length === 0 ? null : encryptJson(env, key());
}

export function decryptEnv(payload: string | null): EnvVars {
  return payload ? decryptJson<EnvVars>(payload, key()) : {};
}

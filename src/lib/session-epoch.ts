import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "./db";

const EPOCH_SETTING = "session_epoch";

/**
 * A value mixed into every sign-in cookie's signing key. Changing it makes all existing cookies invalid at once, which
 * is how "sign out everywhere" works. Empty until the first time it is used.
 */
export const getSessionEpoch = (): string => getSetting(EPOCH_SETTING) ?? "";

/** Signs every browser out. Returns the new epoch. */
export function bumpSessionEpoch(): string {
  const epoch = randomBytes(12).toString("base64url");
  setSetting(EPOCH_SETTING, epoch);
  return epoch;
}

import { collectAlerts } from "./alerts-live";
import { getSetting, setSetting } from "./db";
import { buildNotification, diffAlerts, formatAlertMessage } from "./notify";
import { decryptEnv, encryptEnv } from "./secrets";

const URL_KEY = "notify-url";
const SENT_KEY = "notify-sent-alerts";
const SEND_TIMEOUT_MS = 10_000;

/** The saved address. It can contain a secret token, so it is stored encrypted like environment variables. */
export function getNotifyUrl(): string {
  const stored = getSetting(URL_KEY);
  return stored ? (decryptEnv(stored).url ?? "") : "";
}

export function saveNotifyUrl(url: string): void {
  setSetting(URL_KEY, url ? encryptEnv({ url }) : null);
  if (!url) setSetting(SENT_KEY, null);
}

/** Sends one message. Throws with a readable reason if the service refuses it. */
export async function sendNotification(target: string, message: string): Promise<void> {
  const { url, headers, body } = buildNotification(target, message);
  const response = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`The service answered ${response.status}.`);
}

function previouslySent(): string[] {
  try {
    const parsed: unknown = JSON.parse(getSetting(SENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Sends a message for alerts that appeared since the last check. Does nothing when no address is saved.
 * What was already reported is only remembered after a successful send, so a failed send is tried again next time.
 */
export async function notifyNewAlerts(): Promise<number> {
  const target = getNotifyUrl();
  if (!target) return 0;
  const { fresh, activeIds } = diffAlerts(previouslySent(), collectAlerts());
  if (fresh.length > 0) await sendNotification(target, formatAlertMessage(fresh));
  setSetting(SENT_KEY, JSON.stringify(activeIds));
  return fresh.length;
}

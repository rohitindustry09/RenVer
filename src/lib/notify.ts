import type { Alert } from "./alerts";

/** Turning alerts into messages for Discord, Slack, Telegram or any URL that accepts JSON. Pure, so it is easy to test. */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface Notification {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const TELEGRAM_HOST = "api.telegram.org";

/** An empty string turns notifications off. */
export function validateNotifyUrl(input: string): Checked<string> {
  const text = input.trim();
  if (!text) return { ok: true, value: "" };
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    return { ok: true, value: text };
  } catch {
    return { ok: false, error: "Enter a full web address, like https://discord.com/api/webhooks/…" };
  }
}

/** Discord reads `content`, Slack reads `text`, Telegram needs the chat in the body, and others get plain JSON. */
export function buildNotification(target: string, message: string): Notification {
  const url = new URL(target);
  if (url.hostname === TELEGRAM_HOST) {
    const chatId = url.searchParams.get("chat_id") ?? "";
    url.search = "";
    return { url: url.toString(), headers: JSON_HEADERS, body: JSON.stringify({ chat_id: chatId, text: message }) };
  }
  return { url: target, headers: JSON_HEADERS, body: JSON.stringify({ content: message, text: message }) };
}

/** Where messages go, for showing on screen, without the secret part of the address. */
export function describeTarget(target: string): string {
  try {
    return new URL(target).hostname;
  } catch {
    return "";
  }
}

const NOTIFIED_SEVERITIES: readonly Alert["severity"][] = ["error", "warning"];

/**
 * Which alerts are new since the last check. Informational ones never notify. `activeIds` is what to remember for next
 * time: alerts that went away drop out of it, so a problem that comes back is reported again.
 */
export function diffAlerts(previousIds: readonly string[], current: readonly Alert[]): { fresh: Alert[]; activeIds: string[] } {
  const relevant = current.filter((a) => NOTIFIED_SEVERITIES.includes(a.severity));
  const seen = new Set(previousIds);
  return { fresh: relevant.filter((a) => !seen.has(a.id)), activeIds: relevant.map((a) => a.id) };
}

export function formatAlertMessage(alerts: readonly Alert[]): string {
  const lines = alerts.map((a) => `${a.severity === "error" ? "🔴" : "🟠"} ${a.title} — ${a.detail}`);
  return `RenVer\n${lines.join("\n")}`;
}

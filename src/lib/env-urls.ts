/**
 * Variables that hold the app's own web address (SHOPIFY_APP_URL, NEXT_PUBLIC_APP_URL, NEXTAUTH_URL, ...) must be a full
 * address such as https://app.example.com. People often type just the hostname, which makes many apps crash at start.
 * These rules fix that. Client-safe and pure.
 */

const APP_URL_KEY = /(^|_)(APP|SITE|PUBLIC|BASE|WEBSITE)_URL$|^(NEXTAUTH|AUTH)_URL$/;
const HAS_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const BARE_HOST = /^(localhost|[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+)(:\d{1,5})?(\/.*)?$/;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.)/;

export const isAppUrlKey = (key: string): boolean => APP_URL_KEY.test(key);

/** "app.example.com" becomes "https://app.example.com"; a trailing "/" is dropped. Anything else is left as typed. */
export function normalizeAppUrl(value: string): string {
  const text = value.trim();
  if (text === "") return value;
  if (HAS_SCHEME.test(text)) return text.replace(/\/+$/, "");
  if (!BARE_HOST.test(text)) return value;
  const scheme = PRIVATE_HOST.test(text) ? "http" : "https";
  return `${scheme}://${text}`.replace(/\/+$/, "");
}

/** The value as it should be saved for this variable name. */
export const normalizeEnvValue = (key: string, value: string): string => (isAppUrlKey(key) ? normalizeAppUrl(value) : value);

/**
 * The variables a deploy should really use: address variables made complete, and a Shopify app with no SHOPIFY_APP_URL
 * gets the project's own address. `notes` say what changed, for the deploy log. Never prints values other than the address.
 */
export function prepareAppUrls(env: Record<string, string>, primaryHost: string): { env: Record<string, string>; notes: string[] } {
  const next: Record<string, string> = {};
  const notes: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    const fixed = normalizeEnvValue(key, value);
    if (fixed !== value) notes.push(`${key} is now ${fixed} (it needs a full address, not just the hostname).`);
    next[key] = fixed;
  }
  if (next.SHOPIFY_API_KEY && !(next.SHOPIFY_APP_URL ?? "").trim() && primaryHost) {
    next.SHOPIFY_APP_URL = `https://${primaryHost}`;
    notes.push(`SHOPIFY_APP_URL was not set, so it is now https://${primaryHost}.`);
  }
  return { env: next, notes };
}

/** Shared pieces of the second login step (an authenticator-app code), used by the guard and by the verify routes. */

export const TWO_FACTOR_COOKIE = "renver_2fa";
/** How long a correct code keeps the browser signed in. */
export const TWO_FACTOR_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const VERIFY_PAGE = "/verify";
export const VERIFY_API = "/api/auth/verify";
export const LOCK_API = "/api/auth/lock";

/** The pages and routes needed to *enter* a code. They still need the password, just not a code. */
const EXEMPT_PATHS = new Set([VERIFY_PAGE, VERIFY_API, LOCK_API]);

export const isSecondFactorExempt = (pathname: string): boolean => EXEMPT_PATHS.has(pathname);

/** The secret from RENVER_TOTP_SECRET, or undefined when two-factor login is off. */
export const configuredTotpSecret = (): string | undefined => process.env.RENVER_TOTP_SECRET?.trim() || undefined;

/** Cookies are signed with both the secret and the password, so changing either signs every browser out. */
export const sessionKey = (secret: string, password: string): string => `${secret}:${password}`;

/** The key for the code cookie: the secret plus the sign-in details, so changing any of them signs every browser out. */
export const twoFactorKey = (secret: string, user: string, password: string, epoch = ""): string =>
  sessionKey(secret, `${user}:${password}${epoch ? `#${epoch}` : ""}`);

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Whether the connection to the browser is HTTPS (RenVer itself speaks plain http behind Caddy). */
export function isSecureRequest(headers: { get(name: string): string | null }, url: string): boolean {
  return headers.get("x-forwarded-proto") === "https" || url.startsWith("https:");
}

/** A cookie the page's scripts cannot read, never sent to other sites, and only over HTTPS when the connection is. */
export function buildCookie(name: string, value: string, secure: boolean, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export const sessionCookie = (token: string, secure: boolean): string =>
  buildCookie(TWO_FACTOR_COOKIE, token, secure, Math.floor(TWO_FACTOR_LIFETIME_MS / 1000));

export const clearedCookie = (secure: boolean): string => buildCookie(TWO_FACTOR_COOKIE, "", secure, 0);

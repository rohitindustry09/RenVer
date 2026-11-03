import { constantTimeEqual } from "./auth";

/** The sign-in page's shared pieces, used by the guard, the login routes and the pages. Edge-safe. */

export const LOGIN_COOKIE = "renver_session";
export const LOGIN_PAGE = "/login";
export const LOGIN_API = "/api/auth/login";
export const LOGOUT_API = "/api/auth/logout";
/** Signing in once keeps a browser signed in this long. */
export const LOGIN_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const LOGIN_PURPOSE = "login";

/** The pages and routes someone who is not signed in yet must be able to reach. */
const LOGIN_EXEMPT_PATHS = new Set([LOGIN_PAGE, LOGIN_API, LOGOUT_API]);
export const isLoginExempt = (pathname: string): boolean => LOGIN_EXEMPT_PATHS.has(pathname);

const DEFAULT_USERNAME = "admin";

/** The username to sign in with: RENVER_ADMIN_USER, or "admin". */
export const adminUsername = (configured: string | undefined = process.env.RENVER_ADMIN_USER): string => configured?.trim() || DEFAULT_USERNAME;

/** Signed into the cookie's key, so changing the username or the password signs every browser out. */
export const loginKey = (username: string, password: string, epoch = ""): string => `login:${username}:${password}${epoch ? `#${epoch}` : ""}`;

/**
 * Whether the typed username and password are the right ones. Both are always compared, so how long it takes does not
 * say which was wrong. With no password configured nothing matches.
 */
export async function credentialsMatch(typedUser: string, typedPassword: string, user: string, password: string): Promise<boolean> {
  const [userOk, passwordOk] = await Promise.all([constantTimeEqual(typedUser.trim(), user), constantTimeEqual(typedPassword, password)]);
  return userOk && passwordOk && password.length > 0;
}

const NOT_AFTER_SIGN_IN = ["/login", "/verify", "/api/"];

/**
 * Where to go after signing in. Only a path on this site is allowed (a full address, "//host" or anything with control
 * characters could send someone to another website), and never back to the sign-in pages themselves.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next) || /%0[ad]/i.test(next)) return "/";
  return NOT_AFTER_SIGN_IN.some((prefix) => next === prefix.replace(/\/$/, "") || next.startsWith(prefix) || next.startsWith(`${prefix}?`)) ? "/" : next;
}

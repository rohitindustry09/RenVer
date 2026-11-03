import { isSameOrigin, parseBasicAuth } from "./auth";
import { isIpAllowed, parseAllowList, type AllowRule } from "./ip-allow";
import { LOGIN_COOKIE, LOGIN_PAGE, LOGIN_PURPOSE, adminUsername, credentialsMatch, loginKey, isLoginExempt } from "./login";
import { clientKey, createFailureLimiter } from "./rate-limit";
import { verifySessionToken } from "./session-token";
import { base32Decode } from "./totp";
import {
  TWO_FACTOR_COOKIE,
  VERIFY_PAGE,
  configuredTotpSecret,
  isSecondFactorExempt,
  readCookie,
  twoFactorKey,
} from "./two-factor";

const MAX_FAILED_LOGINS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Wrong passwords sent as a header (scripts) are counted per client; too many and that client is refused for a while. */
const failedHeaderLogins = createFailureLimiter({ max: MAX_FAILED_LOGINS, windowMs: LOGIN_WINDOW_MS });

const json = (body: Record<string, unknown>, status: number, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify({ success: false, ...body }), { status, headers: { "Content-Type": "application/json", ...headers } });

/** A page goes to the sign-in form (and comes back afterwards); an API call or a write gets a 401 that says so. */
function needsSignIn(request: Request, pathname: string): Response {
  if (pathname.startsWith("/api/") || request.method !== "GET") return json({ error: "Sign in required.", login: true }, 401);
  const url = new URL(request.url);
  const next = pathname === "/" && !url.search ? "" : `?next=${encodeURIComponent(pathname + url.search)}`;
  return new Response(null, { status: 307, headers: { Location: `${LOGIN_PAGE}${next}` } });
}

/** Matches no address, so a broken RENVER_ALLOWED_IPS shuts the panel to everyone but the machine itself. */
const NOBODY: AllowRule = { kind: "v6", address: "-" };

/**
 * With RENVER_ALLOWED_IPS set, only those addresses may reach the panel (the machine itself always can). The address
 * is the one the reverse proxy reports; the panel only listens on this machine, so that is Caddy.
 */
function checkAllowedAddress(request: Request): Response | null {
  const list = process.env.RENVER_ALLOWED_IPS?.trim();
  if (!list) return null;
  const parsed = parseAllowList(list);
  const rules = parsed.ok ? parsed.rules : [NOBODY];
  return isIpAllowed(clientKey(request.headers), rules) ? null : new Response("This address is not allowed to use the panel.", { status: 403 });
}

/**
 * Whether this request is signed in: a valid sign-in cookie (from the /login page), or the username and password sent
 * as a header (for scripts). Null when it is; otherwise the response to send.
 */
async function checkSignedIn(request: Request, pathname: string, user: string, password: string, epoch: string): Promise<Response | null> {
  const header = parseBasicAuth(request.headers.get("authorization"));
  if (header) {
    const client = clientKey(request.headers);
    const wait = failedHeaderLogins.retryAfterSeconds(client);
    if (wait > 0) return json({ error: "Too many failed login attempts. Try again later." }, 429, { "Retry-After": String(wait) });
    if (await credentialsMatch(header.user, header.password, user, password)) {
      failedHeaderLogins.reset(client);
      return null;
    }
    failedHeaderLogins.recordFailure(client);
    return json({ error: "Wrong username or password.", login: true }, 401);
  }

  const cookie = readCookie(request.headers.get("cookie"), LOGIN_COOKIE);
  if (cookie && (await verifySessionToken(loginKey(user, password, epoch), cookie, Date.now(), LOGIN_PURPOSE))) return null;
  return needsSignIn(request, pathname);
}

/**
 * The panel's sign-in and cross-site checks. Returns a response to send back, or null when the request may continue.
 * Fails closed in production: the panel can run code, so it must have a password.
 *
 * Used by the middleware, and directly by routes that stream large uploads. Those routes are excluded from the
 * middleware because Next.js buffers (and cuts off) request bodies above 10 MB whenever middleware runs.
 */
export async function guardRequest(request: Request, epoch = ""): Promise<Response | null> {
  const notAllowed = checkAllowedAddress(request);
  if (notAllowed) return notAllowed;

  if (!isSameOrigin(request.method, request.headers)) {
    return new Response("Cross-site request blocked", { status: 403 });
  }

  const password = process.env.RENVER_ADMIN_PASSWORD;
  if (!password) {
    if (process.env.RENVER_MODE === "production") return new Response("Set RENVER_ADMIN_PASSWORD to enable the panel.", { status: 503 });
    return checkSecondFactor(request, adminUsername(), "", epoch);
  }

  const { pathname } = new URL(request.url);
  // The sign-in page and its routes must be reachable by someone who is not signed in yet.
  if (isLoginExempt(pathname)) return null;

  const user = adminUsername();
  const notSignedIn = await checkSignedIn(request, pathname, user, password, epoch);
  if (notSignedIn) return notSignedIn;
  return checkSecondFactor(request, user, password, epoch);
}

/**
 * With RENVER_TOTP_SECRET set, the password is not enough: the browser must also hold the signed cookie that a correct
 * code earns (see /verify). Pages send the person to the code page; API calls get a 401 that says so. A secret that is
 * not valid base32 shuts the panel rather than silently turning the extra step off.
 */
async function checkSecondFactor(request: Request, user: string, password: string, epoch: string): Promise<Response | null> {
  const secret = configuredTotpSecret();
  if (!secret) return null;
  if (base32Decode(secret) === null) return new Response("RENVER_TOTP_SECRET is not a valid base32 secret.", { status: 503 });

  const { pathname } = new URL(request.url);
  if (isSecondFactorExempt(pathname)) return null;
  const token = readCookie(request.headers.get("cookie"), TWO_FACTOR_COOKIE);
  if (token && (await verifySessionToken(twoFactorKey(secret, user, password, epoch), token, Date.now()))) return null;

  if (pathname.startsWith("/api/") || request.method !== "GET") return json({ error: "A two-factor code is required.", twoFactor: true }, 401);
  return new Response(null, { status: 307, headers: { Location: VERIFY_PAGE } });
}

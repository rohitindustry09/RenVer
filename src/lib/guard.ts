import { constantTimeEqual, isSameOrigin, parseBasicAuth } from "./auth";
import { isIpAllowed, parseAllowList, type AllowRule } from "./ip-allow";
import { clientKey, createFailureLimiter } from "./rate-limit";

const REALM = 'Basic realm="RenVer"';
const MAX_FAILED_LOGINS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Wrong passwords are counted per client; too many in a row and that client is refused for a while. */
const failedLogins = createFailureLimiter({ max: MAX_FAILED_LOGINS, windowMs: LOGIN_WINDOW_MS });

function unauthorized(): Response {
  return new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": REALM } });
}

function tooManyAttempts(retryAfterSeconds: number): Response {
  return new Response("Too many failed login attempts. Try again later.", {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
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
 * The panel's login and cross-site checks. Returns a response to send back, or null when the request may continue.
 * Fails closed in production: the panel can run code, so it must have a password.
 *
 * Used by the middleware, and directly by routes that stream large uploads. Those routes are excluded from the
 * middleware because Next.js buffers (and cuts off) request bodies above 10 MB whenever middleware runs.
 */
export async function guardRequest(request: Request): Promise<Response | null> {
  const notAllowed = checkAllowedAddress(request);
  if (notAllowed) return notAllowed;

  if (!isSameOrigin(request.method, request.headers)) {
    return new Response("Cross-site request blocked", { status: 403 });
  }

  const password = process.env.RENVER_ADMIN_PASSWORD;
  if (!password) {
    return process.env.RENVER_MODE === "production"
      ? new Response("Set RENVER_ADMIN_PASSWORD to enable the panel.", { status: 503 })
      : null;
  }

  const client = clientKey(request.headers);
  const wait = failedLogins.retryAfterSeconds(client);
  if (wait > 0) return tooManyAttempts(wait);

  // A request with no credentials is the browser's first visit, not a guess, so it is not counted.
  const credentials = parseBasicAuth(request.headers.get("authorization"));
  if (!credentials) return unauthorized();
  if (await constantTimeEqual(credentials.password, password)) {
    failedLogins.reset(client);
    return null;
  }
  failedLogins.recordFailure(client);
  return unauthorized();
}

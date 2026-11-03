import { getSessionEpoch } from "@/lib/session-epoch";
import { NextResponse } from "next/server";
import { actorOf, recordAudit } from "@/lib/audited";
import {
  LOGIN_COOKIE,
  LOGIN_LIFETIME_MS,
  LOGIN_PURPOSE,
  adminPassword,
  adminUsername,
  credentialsMatch,
  loginKey,
} from "@/lib/login";
import { clientKey, createFailureLimiter } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session-token";
import { buildCookie, configuredTotpSecret, isSecureRequest } from "@/lib/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WRONG_PASSWORDS = 10;
const WINDOW_MS = 15 * 60 * 1000;
/** Both reasons for a refusal read the same, so the page never says which of the two was wrong. */
const WRONG = "Wrong username or password.";

/** Shared by every route bundle in this process, so wrong passwords are counted once, not per bundle. */
const shared = globalThis as typeof globalThis & { __renverLoginLimiter?: ReturnType<typeof createFailureLimiter> };
const limiter = (shared.__renverLoginLimiter ??= createFailureLimiter({ max: MAX_WRONG_PASSWORDS, windowMs: WINDOW_MS }));

const refuse = (error: string, status: number, headers?: Record<string, string>) =>
  NextResponse.json({ success: false, error }, { status, headers });

/** Body: `{ "username": "admin", "password": "…" }`. A correct pair sets the signed sign-in cookie. */
export async function POST(request: Request) {
  const password = adminPassword();
  if (!password) return refuse("Sign-in is not turned on: no password is set.", 400);

  const client = clientKey(request.headers);
  const wait = limiter.retryAfterSeconds(client);
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60);
    return refuse(`Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, 429, { "Retry-After": String(wait) });
  }

  const body = (await request.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const user = adminUsername();
  const matches = await credentialsMatch(
    typeof body.username === "string" ? body.username : "",
    typeof body.password === "string" ? body.password : "",
    user,
    password,
  );
  if (!matches) {
    limiter.recordFailure(client);
    process.stderr.write(`[renver] security: wrong password from ${client}\n`);
    recordAudit(actorOf(request), "auth.login.failed");
    return refuse(WRONG, 401);
  }

  limiter.reset(client);
  recordAudit(actorOf(request), "auth.login.ok");
  const token = await createSessionToken(loginKey(user, password, getSessionEpoch()), Date.now(), LOGIN_LIFETIME_MS, LOGIN_PURPOSE);
  const secure = isSecureRequest(request.headers, request.url) || process.env.RENVER_MODE === "production";
  const response = NextResponse.json({ success: true, data: { twoFactor: configuredTotpSecret() !== undefined } });
  response.headers.append("Set-Cookie", buildCookie(LOGIN_COOKIE, token, secure, Math.floor(LOGIN_LIFETIME_MS / 1000)));
  return response;
}

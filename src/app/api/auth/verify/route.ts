import { getSessionEpoch } from "@/lib/session-epoch";
import { NextResponse } from "next/server";
import { actorOf, recordAudit } from "@/lib/audited";
import { adminPassword, adminUsername } from "@/lib/login";
import { createSessionToken } from "@/lib/session-token";
import { createFailureLimiter, clientKey } from "@/lib/rate-limit";
import { getSetting, setSetting } from "@/lib/db";
import { matchRecoveryCode } from "@/lib/recovery-codes";
import { verifyTotp } from "@/lib/totp";
import {
  TWO_FACTOR_LIFETIME_MS,
  configuredTotpSecret,
  isSecureRequest,
  sessionCookie,
  twoFactorKey,
} from "@/lib/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WRONG_CODES = 8;
const WINDOW_MS = 10 * 60 * 1000;

/** Shared by every route bundle in this process, so wrong codes are counted once, not per bundle. */
const shared = globalThis as typeof globalThis & {
  __renverTotpLimiter?: ReturnType<typeof createFailureLimiter>;
  __renverTotpLastStep?: number;
};
const limiter = (shared.__renverTotpLimiter ??= createFailureLimiter({ max: MAX_WRONG_CODES, windowMs: WINDOW_MS }));

const refuse = (error: string, status: number, headers?: Record<string, string>) =>
  NextResponse.json({ success: false, error }, { status, headers });

const USED_SETTING = "recovery_used";

/** Whether the text is a recovery code that has not been used yet. If so it is marked used, so it works once. */
async function useRecoveryCode(secret: string, text: string): Promise<boolean> {
  const code = await matchRecoveryCode(secret, text);
  if (!code) return false;
  const used = new Set<string>(JSON.parse(getSetting(USED_SETTING) ?? "[]") as string[]);
  if (used.has(code)) return false;
  setSetting(USED_SETTING, JSON.stringify([...used, code]));
  return true;
}

/** Body: `{ "code": "123456" }`. A correct code sets the signed cookie the guard looks for. */
export async function POST(request: Request) {
  const secret = configuredTotpSecret();
  if (!secret) return refuse("Two-factor login is not turned on.", 400);

  const client = clientKey(request.headers);
  const wait = limiter.retryAfterSeconds(client);
  if (wait > 0) return refuse("Too many wrong codes. Try again later.", 429, { "Retry-After": String(wait) });

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const typed = typeof body.code === "string" ? body.code : "";
  const recovery = await useRecoveryCode(secret, typed);
  const result = recovery ? { ok: true as const, step: shared.__renverTotpLastStep ?? 0 } : await verifyTotp(secret, typed, Date.now(), { afterStep: shared.__renverTotpLastStep });
  if (!result.ok) {
    limiter.recordFailure(client);
    process.stderr.write(`[renver] security: wrong two-factor code from ${client}\n`);
    recordAudit(actorOf(request), "auth.2fa.failed");
    return refuse("That code is not right. Codes change every 30 seconds; wait for a new one and try again.", 401);
  }

  limiter.reset(client);
  if (!recovery) shared.__renverTotpLastStep = result.step;
  recordAudit(actorOf(request), recovery ? "auth.2fa.recovery" : "auth.2fa.ok");
  const token = await createSessionToken(twoFactorKey(secret, adminUsername(), adminPassword() ?? "", getSessionEpoch()), Date.now(), TWO_FACTOR_LIFETIME_MS);
  const response = NextResponse.json({ success: true, data: { ok: true } });
  response.headers.append("Set-Cookie", sessionCookie(token, isSecureRequest(request.headers, request.url) || process.env.RENVER_MODE === "production"));
  return response;
}

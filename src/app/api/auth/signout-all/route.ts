import { NextResponse } from "next/server";
import { audited } from "@/lib/audited";
import { LOGIN_COOKIE } from "@/lib/login";
import { bumpSessionEpoch } from "@/lib/session-epoch";
import { buildCookie, clearedCookie, cookiesAreSecure } from "@/lib/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invalidates every sign-in cookie on every browser, this one included. Everyone signs in again. */
export const POST = audited("auth.signout_all", async (request: Request) => {
  bumpSessionEpoch();
  const secure = cookiesAreSecure(request.headers, request.url);
  const response = NextResponse.json({ success: true, data: { signedOut: true } });
  response.headers.append("Set-Cookie", buildCookie(LOGIN_COOKIE, "", secure, 0));
  response.headers.append("Set-Cookie", clearedCookie(secure));
  return response;
});

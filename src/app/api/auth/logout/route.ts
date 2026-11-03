import { NextResponse } from "next/server";
import { actorOf, recordAudit } from "@/lib/audited";
import { LOGIN_COOKIE } from "@/lib/login";
import { TWO_FACTOR_COOKIE, buildCookie, cookiesAreSecure } from "@/lib/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signs this browser out: both the sign-in cookie and the code cookie are cleared. */
export async function POST(request: Request) {
  const secure = cookiesAreSecure(request.headers, request.url);
  // Only worth a log line when someone was actually signed in.
  if (request.headers.get("cookie")?.includes(LOGIN_COOKIE)) recordAudit(actorOf(request), "auth.logout");
  const response = NextResponse.json({ success: true, data: { signedOut: true } });
  response.headers.append("Set-Cookie", buildCookie(LOGIN_COOKIE, "", secure, 0));
  response.headers.append("Set-Cookie", buildCookie(TWO_FACTOR_COOKIE, "", secure, 0));
  return response;
}

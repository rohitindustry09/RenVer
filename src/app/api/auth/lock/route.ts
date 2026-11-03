import { NextResponse } from "next/server";
import { actorOf, recordAudit } from "@/lib/audited";
import { clearedCookie, cookiesAreSecure } from "@/lib/two-factor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signs this browser out of the code step: the next page asks for a code again. The password prompt is the browser's own. */
export async function POST(request: Request) {
  recordAudit(actorOf(request), "auth.lock");
  const response = NextResponse.json({ success: true, data: { locked: true } });
  response.headers.append("Set-Cookie", clearedCookie(cookiesAreSecure(request.headers, request.url)));
  return response;
}

import { NextResponse, type NextRequest } from "next/server";
import { guardRequest } from "./lib/guard";
import { SETUP_COOKIE, shouldRedirectToSetup } from "./lib/setup-gate";

/** GitHub cannot log in to the panel; this route checks a signature instead (see the route). */
const WEBHOOK_PREFIX = "/api/webhooks/";
/** Uptime monitors cannot log in either. */
const HEALTH_PATH = "/api/health";

export async function middleware(request: NextRequest): Promise<Response> {
  if (request.nextUrl.pathname.startsWith(WEBHOOK_PREFIX) && request.method === "POST") return NextResponse.next();
  if (request.nextUrl.pathname === HEALTH_PATH && request.method === "GET") return NextResponse.next();
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  const { pathname } = request.nextUrl;
  if (shouldRedirectToSetup(pathname, request.cookies.has(SETUP_COOKIE))) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }
  return NextResponse.next();
}

/**
 * Every route except static files and the two streaming upload routes. Those call guardRequest themselves,
 * because running middleware would make Next.js buffer their body and cut it off at 10 MB.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/analyze$|api/backups/upload$).*)"],
};

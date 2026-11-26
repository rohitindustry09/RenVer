import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { cloudflare } from "@/lib/cloudflare-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether a token is saved and the tunnel is up. The token itself is never sent back. */
export async function GET() {
  return ok(cloudflare().status());
}

/** Body: `{ "token": "..." }`. The token is checked with Cloudflare, then stored encrypted. */
async function handlePUT(request: Request) {
  try {
    const body = (await request.json()) as { token?: unknown };
    await cloudflare().saveToken(typeof body.token === "string" ? body.token : "");
    return ok(cloudflare().status());
  } catch (error) {
    return failFrom(error);
  }
}

/** Stops the tunnel and removes the DNS records and tunnel RenVer made in Cloudflare. */
async function handleDELETE() {
  try {
    const problems = await cloudflare().disconnect();
    return ok({ ...cloudflare().status(), problems });
  } catch (error) {
    return failFrom(error);
  }
}

export const PUT = audited("settings.cloudflare", handlePUT);
export const DELETE = audited("settings.cloudflare.remove", handleDELETE);

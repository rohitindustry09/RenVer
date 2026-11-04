import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { clearGithubToken, githubConnection, saveGithubToken, verifyGithubToken } from "@/lib/github-auth";
import { validateGithubToken } from "@/lib/github-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether GitHub is connected, and as whom. The token itself is never sent back to the browser. */
export async function GET() {
  return ok(githubConnection());
}

/** Body: `{ "token": "github_pat_…" }`. The token is checked with GitHub first, then stored encrypted. */
async function handlePUT(request: Request) {
  try {
    const body = (await request.json()) as { token?: unknown };
    const checked = validateGithubToken(typeof body.token === "string" ? body.token : "");
    if (!checked.ok) return failFrom(checked.error, 400);
    const verified = await verifyGithubToken(checked.value);
    if (!verified.ok) return failFrom(verified.error, 400);
    saveGithubToken(checked.value, verified.login);
    return ok(githubConnection());
  } catch (error) {
    return failFrom(error, 500);
  }
}

async function handleDELETE() {
  clearGithubToken();
  return ok(githubConnection());
}

// The audit detail is left empty on purpose: it must never hold the token.
export const PUT = audited("settings.github", handlePUT);
export const DELETE = audited("settings.github.remove", handleDELETE);

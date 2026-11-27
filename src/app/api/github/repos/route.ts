import { ok } from "@/lib/api";
import { getGithubToken, githubConnection } from "@/lib/github-auth";
import { listRepos } from "@/lib/github-repos-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The repositories the saved GitHub token can see, for the import screen's picker. Answers 200 even when GitHub could not
 * be reached, with the reason in `error`, so the screen can say why instead of failing. The token is never sent back.
 */
export async function GET() {
  const token = getGithubToken();
  if (!token) return ok({ connected: false, login: null, repos: [], error: null });

  const result = await listRepos(token);
  return ok({
    connected: true,
    login: githubConnection().login,
    repos: result.ok ? result.repos : [],
    error: result.ok ? null : result.error,
  });
}

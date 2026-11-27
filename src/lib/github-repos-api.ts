import { parseRepos, type RepoOption } from "./github-repos";

export type RepoResult = { ok: true; repos: RepoOption[] } | { ok: false; error: string };

const API = "https://api.github.com/user/repos";
const PAGE_SIZE = 100;
/** Three pages is 300 repositories: enough to pick from, and the search box finds the rest by typing the name. */
const MAX_PAGES = 3;
const TIMEOUT_MS = 10_000;
const CACHE_MS = 60_000;

interface Options {
  fetcher: typeof fetch;
  ttlMs: number;
  now: () => number;
}

/**
 * Asks GitHub for the repositories the token can see, most recently pushed first. The newest answer is kept for a
 * minute (for the same token only), so opening the picker repeatedly does not ask GitHub every time. Errors are never
 * kept, and the token is never put into a message.
 */
export function createRepoLister({ fetcher, ttlMs, now }: Options): (token: string) => Promise<RepoResult> {
  let cached: { token: string; at: number; repos: RepoOption[] } | null = null;

  return async (token) => {
    if (cached && cached.token === token && now() - cached.at < ttlMs) return { ok: true, repos: cached.repos };

    const repos: RepoOption[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      let response: Response;
      try {
        response = await fetcher(`${API}?per_page=${PAGE_SIZE}&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member&page=${page}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "RenVer", "X-GitHub-Api-Version": "2022-11-28" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        return { ok: false, error: "Could not reach GitHub from this server. Check its internet connection." };
      }
      if (response.status === 401) return { ok: false, error: "GitHub did not accept the saved token. It may be expired or revoked." };
      if (!response.ok) return { ok: false, error: `GitHub answered with an error (${response.status}). Try again in a moment.` };

      const batch = parseRepos(await response.json().catch(() => []));
      repos.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    cached = { token, at: now(), repos };
    return { ok: true, repos };
  };
}

/** The shared lister of this process. */
export const listRepos = createRepoLister({ fetcher: fetch, ttlMs: CACHE_MS, now: Date.now });

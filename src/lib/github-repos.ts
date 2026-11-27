/** What a person's GitHub repository list looks like to the import screen. Pure and client-safe. */

export interface RepoOption {
  /** "owner/name", exactly what the import form accepts. */
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string | null;
  pushedAt: string | null;
}

const asText = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/** Turns GitHub's answer into repository options, skipping anything that is not a repository. */
export function parseRepos(json: unknown): RepoOption[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item: unknown): RepoOption[] => {
    const entry = (item ?? {}) as Record<string, unknown>;
    const fullName = asText(entry.full_name);
    if (!fullName) return [];
    return [
      {
        fullName,
        isPrivate: entry.private === true,
        defaultBranch: asText(entry.default_branch) ?? "main",
        description: asText(entry.description),
        pushedAt: asText(entry.pushed_at),
      },
    ];
  });
}

/** What was typed, reduced to lower-case "owner/repo" so a pasted address matches too. */
export function normalizeQuery(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^(www\.)?github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

/** The repositories that match the text, best first: names starting with it, then names that merely contain it. */
export function filterRepos(repos: RepoOption[], query: string, limit = 50): RepoOption[] {
  const needle = normalizeQuery(query);
  if (needle === "") return repos.slice(0, limit);

  const scored = repos.flatMap((repo, index) => {
    const full = repo.fullName.toLowerCase();
    const name = full.slice(full.indexOf("/") + 1);
    if (full.startsWith(needle) || name.startsWith(needle)) return [{ repo, rank: 0, index }];
    if (full.includes(needle)) return [{ repo, rank: 1, index }];
    return [];
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.repo);
}

/** The highlighted row after an arrow key. -1 means none; it wraps around at both ends. */
export function moveActive(current: number, count: number, key: "ArrowDown" | "ArrowUp"): number {
  if (count === 0) return -1;
  if (key === "ArrowDown") return current + 1 >= count ? 0 : current + 1;
  return current <= 0 ? count - 1 : current - 1;
}

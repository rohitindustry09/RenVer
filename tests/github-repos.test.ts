import { describe, expect, it } from "vitest";
import { filterRepos, moveActive, normalizeQuery, parseRepos, type RepoOption } from "@/lib/github-repos";
import { createRepoLister } from "@/lib/github-repos-api";

const repo = (fullName: string, extra: Partial<RepoOption> = {}): RepoOption => ({
  fullName,
  isPrivate: false,
  defaultBranch: "main",
  description: null,
  pushedAt: null,
  ...extra,
});

describe("parseRepos", () => {
  it("keeps the fields RenVer shows and skips malformed entries", () => {
    const parsed = parseRepos([
      { full_name: "me/app", private: true, default_branch: "dev", description: "An app", pushed_at: "2026-11-20T10:00:00Z" },
      { full_name: "me/lib", private: false, default_branch: "main", description: null, pushed_at: null },
      { nope: true },
      null,
      { full_name: 42 },
    ]);
    expect(parsed).toEqual([
      { fullName: "me/app", isPrivate: true, defaultBranch: "dev", description: "An app", pushedAt: "2026-11-20T10:00:00Z" },
      { fullName: "me/lib", isPrivate: false, defaultBranch: "main", description: null, pushedAt: null },
    ]);
  });

  it("returns nothing for an answer that is not a list", () => {
    expect(parseRepos({ message: "Bad credentials" })).toEqual([]);
  });
});

describe("normalizeQuery", () => {
  it("reduces a pasted address to owner/repo", () => {
    expect(normalizeQuery("https://github.com/me/app")).toBe("me/app");
    expect(normalizeQuery("github.com/me/app.git")).toBe("me/app");
    expect(normalizeQuery("  ME/App/ ")).toBe("me/app");
    expect(normalizeQuery("app")).toBe("app");
  });
});

describe("filterRepos", () => {
  const all = [repo("me/shop-api"), repo("me/blog"), repo("acme/shop-web"), repo("me/Notes")];

  it("lists everything (up to the limit) when nothing is typed", () => {
    expect(filterRepos(all, "", 3).map((r) => r.fullName)).toEqual(["me/shop-api", "me/blog", "acme/shop-web"]);
  });

  it("matches part of the name in any case", () => {
    expect(filterRepos(all, "SHOP").map((r) => r.fullName)).toEqual(["me/shop-api", "acme/shop-web"]);
  });

  it("matches the owner and the repository together", () => {
    expect(filterRepos(all, "acme/sh").map((r) => r.fullName)).toEqual(["acme/shop-web"]);
  });

  it("works with a full pasted URL", () => {
    expect(filterRepos(all, "https://github.com/me/blog").map((r) => r.fullName)).toEqual(["me/blog"]);
  });

  it("puts names that start with the text before names that only contain it", () => {
    const list = [repo("me/old-shop"), repo("me/shop"), repo("zed/shop-two")];
    expect(filterRepos(list, "shop").map((r) => r.fullName)).toEqual(["me/shop", "zed/shop-two", "me/old-shop"]);
  });

  it("finds nothing for text that matches no repository", () => {
    expect(filterRepos(all, "zzz")).toEqual([]);
  });
});

describe("moveActive", () => {
  it("moves down and up and wraps around", () => {
    expect(moveActive(-1, 3, "ArrowDown")).toBe(0);
    expect(moveActive(2, 3, "ArrowDown")).toBe(0);
    expect(moveActive(0, 3, "ArrowUp")).toBe(2);
    expect(moveActive(-1, 3, "ArrowUp")).toBe(2);
  });
  it("has nothing to move to when the list is empty", () => {
    expect(moveActive(-1, 0, "ArrowDown")).toBe(-1);
  });
});

function page(count: number, start = 0) {
  return Array.from({ length: count }, (_, i) => ({ full_name: `me/r${start + i}`, private: false, default_branch: "main", description: null, pushed_at: null }));
}

function lister(responses: { status?: number; body: unknown }[], now = { t: 0 }) {
  const urls: string[] = [];
  const fetcher = (async (url: string) => {
    urls.push(url);
    const next = responses.shift() ?? { body: [] };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as typeof fetch;
  return { list: createRepoLister({ fetcher, ttlMs: 60_000, now: () => now.t }), urls, now };
}

describe("listing a person's repositories", () => {
  it("asks for the most recently pushed repositories and sends the token as a bearer header", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify(page(2)), { status: 200 });
    }) as typeof fetch;
    const result = await createRepoLister({ fetcher, ttlMs: 1000, now: () => 0 })("tok");
    expect(result).toMatchObject({ ok: true });
    expect(calls[0]!.url).toContain("https://api.github.com/user/repos");
    expect(calls[0]!.url).toContain("sort=pushed");
    expect(calls[0]!.url).toContain("per_page=100");
    expect(calls[0]!.auth).toBe("Bearer tok");
  });

  it("reads further pages while a page is full, up to a limit", async () => {
    const { list, urls } = lister([{ body: page(100, 0) }, { body: page(100, 100) }, { body: page(5, 200) }]);
    const result = await list("tok");
    expect(result.ok && result.repos).toHaveLength(205);
    expect(urls).toHaveLength(3);
    expect(urls[1]).toContain("page=2");
  });

  it("stops after the page limit", async () => {
    const { list, urls } = lister(Array.from({ length: 10 }, (_, i) => ({ body: page(100, i * 100) })));
    const result = await list("tok");
    expect(result.ok && result.repos.length).toBe(300);
    expect(urls).toHaveLength(3);
  });

  it("reuses a recent answer for the same token and asks again once it is old", async () => {
    const { list, urls, now } = lister([{ body: page(1) }, { body: page(2) }]);
    await list("tok");
    now.t = 30_000;
    expect((await list("tok")).ok && (await list("tok"))).toBeTruthy();
    expect(urls).toHaveLength(1);
    now.t = 61_000;
    const refreshed = await list("tok");
    expect(refreshed.ok && refreshed.repos).toHaveLength(2);
    expect(urls).toHaveLength(2);
  });

  it("does not hand one token's list to another token", async () => {
    const { list, urls } = lister([{ body: page(1) }, { body: page(3) }]);
    await list("tok-a");
    const other = await list("tok-b");
    expect(other.ok && other.repos).toHaveLength(3);
    expect(urls).toHaveLength(2);
  });

  it("explains a token GitHub refuses, without echoing it", async () => {
    const { list } = lister([{ status: 401, body: { message: "Bad credentials" } }]);
    const result = await list("github_pat_secret");
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.error).toMatch(/did not accept/i);
    expect(JSON.stringify(result)).not.toContain("github_pat_secret");
  });

  it("explains other GitHub errors and network failures", async () => {
    expect((await lister([{ status: 500, body: {} }]).list("t")).ok).toBe(false);
    const failing = createRepoLister({ fetcher: (async () => { throw new Error("offline"); }) as typeof fetch, ttlMs: 1, now: () => 0 });
    const result = await failing("t");
    expect(result.ok === false && result.error).toMatch(/reach GitHub/i);
  });
});

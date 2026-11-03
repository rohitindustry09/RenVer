import { describe, expect, it, vi } from "vitest";
import { createFetchCache } from "@/lib/fetch-cache";

function setup(initial: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const results = new Map<string, unknown | Error>(Object.entries(initial));
  const gates = new Map<string, () => void>();
  let clock = 0;

  const fetcher = vi.fn(async (url: string) => {
    calls.push(url);
    const outcome = results.get(url);
    if (gates.has(url)) await new Promise<void>((resolve) => gates.set(url, resolve));
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });

  const cache = createFetchCache(fetcher as never, () => clock);
  return {
    cache,
    calls,
    fetcher,
    set: (url: string, value: unknown) => results.set(url, value),
    hold: (url: string) => gates.set(url, () => undefined),
    release: (url: string) => gates.get(url)?.(),
    tick: (ms: number) => (clock += ms),
  };
}

describe("createFetchCache", () => {
  it("has nothing for a url until it has been loaded", () => {
    const { cache } = setup();
    expect(cache.peek("/a")).toBeUndefined();
  });

  it("stores loaded data and tells subscribers", async () => {
    const { cache } = setup({ "/a": { n: 1 } });
    const seen: unknown[] = [];
    cache.subscribe("/a", () => seen.push(cache.peek("/a")?.data));
    await cache.revalidate("/a");
    expect(cache.peek("/a")).toMatchObject({ data: { n: 1 }, error: null, isLoading: false });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toEqual({ n: 1 });
  });

  it("marks a url as loading while the first request is in flight", async () => {
    const { cache, hold, release } = setup({ "/a": 1 });
    hold("/a");
    const pending = cache.revalidate("/a");
    expect(cache.peek("/a")).toMatchObject({ data: null, isLoading: true });
    release("/a");
    await pending;
    expect(cache.peek("/a")?.isLoading).toBe(false);
  });

  it("shares one request between simultaneous callers", async () => {
    const { cache, fetcher, hold, release } = setup({ "/a": 1 });
    hold("/a");
    const first = cache.revalidate("/a");
    const second = cache.revalidate("/a");
    release("/a");
    await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the old data visible while refreshing, then swaps in the new data", async () => {
    const { cache, set, hold, release } = setup({ "/a": "old" });
    await cache.revalidate("/a");
    set("/a", "new");
    hold("/a");
    const refresh = cache.revalidate("/a");
    expect(cache.peek("/a")).toMatchObject({ data: "old", isLoading: false, isRefreshing: true });
    release("/a");
    await refresh;
    expect(cache.peek("/a")).toMatchObject({ data: "new", isRefreshing: false });
  });

  it("keeps the last good data and reports the error when a refresh fails", async () => {
    const { cache, set } = setup({ "/a": "good" });
    await cache.revalidate("/a");
    set("/a", new Error("server down"));
    await cache.revalidate("/a");
    expect(cache.peek("/a")).toMatchObject({ data: "good", error: "server down" });
  });

  it("clears the error once a later request works", async () => {
    const { cache, set } = setup({ "/a": new Error("boom") });
    await cache.revalidate("/a");
    expect(cache.peek("/a")?.error).toBe("boom");
    set("/a", "fine");
    await cache.revalidate("/a");
    expect(cache.peek("/a")).toMatchObject({ data: "fine", error: null });
  });

  it("does not notify subscribers of other urls", async () => {
    const { cache } = setup({ "/a": 1, "/b": 2 });
    const listener = vi.fn();
    cache.subscribe("/b", listener);
    await cache.revalidate("/a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", async () => {
    const { cache } = setup({ "/a": 1 });
    const listener = vi.fn();
    const unsubscribe = cache.subscribe("/a", listener);
    unsubscribe();
    await cache.revalidate("/a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns the same object until something changes, so React can compare it", async () => {
    const { cache } = setup({ "/a": 1 });
    await cache.revalidate("/a");
    expect(cache.peek("/a")).toBe(cache.peek("/a"));
  });

  it("set() makes new data visible immediately", async () => {
    const { cache } = setup();
    const listener = vi.fn();
    cache.subscribe("/a", listener);
    cache.set("/a", { fromWrite: true });
    expect(cache.peek("/a")).toMatchObject({ data: { fromWrite: true }, error: null });
    expect(listener).toHaveBeenCalled();
  });

  describe("prefetch", () => {
    it("loads a url nobody has asked for yet", async () => {
      const { cache, fetcher } = setup({ "/a": 1 });
      cache.prefetch("/a");
      await vi.waitFor(() => expect(cache.peek("/a")?.data).toBe(1));
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("skips data that is still fresh and refreshes data that has gone stale", async () => {
      const { cache, fetcher, tick } = setup({ "/a": 1 });
      await cache.revalidate("/a");
      cache.prefetch("/a", 10_000);
      expect(fetcher).toHaveBeenCalledTimes(1);

      tick(11_000);
      cache.prefetch("/a", 10_000);
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    });

    it("never throws, even when the request fails", async () => {
      const { cache } = setup({ "/a": new Error("nope") });
      expect(() => cache.prefetch("/a")).not.toThrow();
      await vi.waitFor(() => expect(cache.peek("/a")?.error).toBe("nope"));
    });
  });

  it("clear() forgets everything", async () => {
    const { cache } = setup({ "/a": 1 });
    await cache.revalidate("/a");
    cache.clear();
    expect(cache.peek("/a")).toBeUndefined();
  });
});

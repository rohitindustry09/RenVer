/**
 * A tiny stale-while-revalidate cache for the browser. Pages show what is already known the moment they open, and
 * refresh it in the background, so going back to a page you have seen is instant instead of a blank wait.
 */

export interface CacheEntry<T = unknown> {
  data: T | null;
  error: string | null;
  /** True only while the very first request has no data to show yet. */
  isLoading: boolean;
  /** True while data is already on screen and being refreshed behind it. */
  isRefreshing: boolean;
  updatedAt: number;
}

type Fetcher = <T>(url: string) => Promise<T>;
type Listener = () => void;

export interface FetchCache {
  /** The current entry. The same object is returned until something changes. */
  peek<T = unknown>(url: string): CacheEntry<T> | undefined;
  /** Fetches and stores. Simultaneous calls for one url share a single request. Never rejects. */
  revalidate(url: string): Promise<void>;
  subscribe(url: string, listener: Listener): () => void;
  /** Warms the cache in the background, unless it already holds data newer than `maxAgeMs`. */
  prefetch(url: string, maxAgeMs?: number): void;
  set<T>(url: string, data: T): void;
  clear(): void;
}

const DEFAULT_PREFETCH_MAX_AGE_MS = 10_000;

export function createFetchCache(fetcher: Fetcher, now: () => number = Date.now): FetchCache {
  const entries = new Map<string, CacheEntry>();
  const listeners = new Map<string, Set<Listener>>();
  const inflight = new Map<string, Promise<void>>();

  const notify = (url: string): void => listeners.get(url)?.forEach((listener) => listener());

  const write = (url: string, patch: Partial<CacheEntry>): void => {
    const current = entries.get(url) ?? { data: null, error: null, isLoading: false, isRefreshing: false, updatedAt: 0 };
    entries.set(url, { ...current, ...patch });
    notify(url);
  };

  const revalidate = (url: string): Promise<void> => {
    const existing = inflight.get(url);
    if (existing) return existing;

    const hasData = entries.get(url)?.data != null;
    write(url, { isLoading: !hasData, isRefreshing: hasData });

    const request = fetcher<unknown>(url)
      .then((data) => write(url, { data, error: null, isLoading: false, isRefreshing: false, updatedAt: now() }))
      .catch((error: unknown) =>
        write(url, {
          error: error instanceof Error ? error.message : "Request failed",
          isLoading: false,
          isRefreshing: false,
        }),
      )
      .finally(() => inflight.delete(url));

    inflight.set(url, request);
    return request;
  };

  return {
    peek: <T>(url: string) => entries.get(url) as CacheEntry<T> | undefined,
    revalidate,
    subscribe(url, listener) {
      const set = listeners.get(url) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(url, set);
      return () => {
        set.delete(listener);
      };
    },
    prefetch(url, maxAgeMs = DEFAULT_PREFETCH_MAX_AGE_MS) {
      const entry = entries.get(url);
      const isFresh = entry?.data != null && now() - entry.updatedAt < maxAgeMs;
      if (!isFresh) void revalidate(url);
    },
    set(url, data) {
      write(url, { data, error: null, isLoading: false, isRefreshing: false, updatedAt: now() });
    },
    clear() {
      entries.clear();
      inflight.clear();
    },
  };
}

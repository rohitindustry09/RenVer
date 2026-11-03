"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { clientCache } from "@/lib/client-cache";

const NO_UNSUBSCRIBE = (): void => undefined;

/**
 * Loads JSON from an API route through the shared cache.
 * Cached data is returned immediately (so a page you have already seen opens instantly) and refreshed in the
 * background; polling pauses while the tab is hidden.
 */
export function useFetch<T>(url: string | null, intervalMs?: number) {
  const subscribe = useCallback(
    (onChange: () => void) => (url ? clientCache.subscribe(url, onChange) : NO_UNSUBSCRIBE),
    [url],
  );
  const getSnapshot = useCallback(() => (url ? clientCache.peek<T>(url) : undefined), [url]);
  const entry = useSyncExternalStore(subscribe, getSnapshot, () => undefined);

  useEffect(() => {
    if (!url) return;
    void clientCache.revalidate(url);
    if (!intervalMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void clientCache.revalidate(url);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [url, intervalMs]);

  const reload = useCallback(() => (url ? clientCache.revalidate(url) : Promise.resolve()), [url]);

  return {
    data: entry?.data ?? null,
    error: entry?.error ?? null,
    reload,
    /** True until the first data for this url arrives. False while refreshing data that is already on screen. */
    isLoading: !entry || entry.isLoading,
    isRefreshing: Boolean(entry?.isRefreshing),
  };
}

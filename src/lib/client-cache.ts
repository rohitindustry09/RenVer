import { api } from "./client-api";
import { createFetchCache } from "./fetch-cache";
import { dataUrlsForRoute } from "./route-data";

/** One cache for the whole browser tab. It survives page changes, which is what makes going back instant. */
export const clientCache = createFetchCache(<T>(url: string) => api<T>(url));

/** Starts loading a page's data in the background, for example when its menu item is hovered. */
export function prefetchRoute(href: string): void {
  for (const url of dataUrlsForRoute(href)) clientCache.prefetch(url);
}

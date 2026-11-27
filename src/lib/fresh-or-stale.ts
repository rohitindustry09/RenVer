/**
 * Waits a short while for a fresh answer; if it is slow, returns the last known one right away and lets the slow check
 * finish in the background. A page that polls must never have its requests held for seconds by a slow network, because a
 * browser only runs a few requests at once and the rest of the page would wait behind them.
 */
export async function freshOrStale<T>(run: () => Promise<T>, last: () => T | null, waitMs: number): Promise<T | null> {
  const fresh = run().catch(() => last());
  const timeout = new Promise<T | null>((resolve) => setTimeout(() => resolve(last()), waitMs));
  return Promise.race([fresh, timeout]);
}

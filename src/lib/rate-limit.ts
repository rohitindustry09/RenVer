/** Slows down password guessing: too many failures from one client and it is refused for a while. */

interface Options {
  /** Failures allowed within the window before the client is blocked. */
  max: number;
  windowMs: number;
  now?: () => number;
}

export interface FailureLimiter {
  /** 0 when the client may try; otherwise the seconds until it may. */
  retryAfterSeconds(key: string): number;
  recordFailure(key: string): void;
  reset(key: string): void;
  size(): number;
}

const MS_PER_SECOND = 1000;
const SWEEP_EVERY = 200;

export function createFailureLimiter({ max, windowMs, now = Date.now }: Options): FailureLimiter {
  const failures = new Map<string, number[]>();
  let writes = 0;

  const recent = (key: string): number[] => {
    const cutoff = now() - windowMs;
    const kept = (failures.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length > 0) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };

  /** Drops clients whose failures have all expired, so a flood of different addresses cannot fill memory. */
  const sweep = (): void => {
    for (const key of [...failures.keys()]) recent(key);
  };

  return {
    retryAfterSeconds(key) {
      const kept = recent(key);
      if (kept.length < max) return 0;
      return Math.max(1, Math.ceil((kept[0]! + windowMs - now()) / MS_PER_SECOND));
    },
    recordFailure(key) {
      failures.set(key, [...recent(key), now()]);
      writes += 1;
      if (writes % SWEEP_EVERY === 0) sweep();
      if (failures.size > SWEEP_EVERY * 5) sweep();
    },
    reset(key) {
      failures.delete(key);
    },
    size() {
      sweep();
      return failures.size;
    },
  };
}

interface HeaderReader {
  get(name: string): string | null;
}

/** Who is asking, as far as a reverse proxy tells us. Without one, everyone shares a key. */
export function clientKey(headers: HeaderReader): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "direct";
}

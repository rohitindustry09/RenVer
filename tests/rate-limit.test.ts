import { describe, expect, it } from "vitest";
import { clientKey, createFailureLimiter } from "@/lib/rate-limit";

const MINUTE = 60_000;

function setup(max = 3, windowMs = 10 * MINUTE) {
  let now = 1_000_000;
  const limiter = createFailureLimiter({ max, windowMs, now: () => now });
  return { limiter, advance: (ms: number) => (now += ms) };
}

describe("createFailureLimiter", () => {
  it("lets a client try until it reaches the limit, then blocks it", () => {
    const { limiter } = setup(3);
    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfterSeconds("a")).toBe(0);
      limiter.recordFailure("a");
    }
    expect(limiter.retryAfterSeconds("a")).toBeGreaterThan(0);
  });

  it("only blocks the client that failed", () => {
    const { limiter } = setup(2);
    limiter.recordFailure("a");
    limiter.recordFailure("a");
    expect(limiter.retryAfterSeconds("a")).toBeGreaterThan(0);
    expect(limiter.retryAfterSeconds("b")).toBe(0);
  });

  it("forgets failures once the window has passed", () => {
    const { limiter, advance } = setup(2, 10 * MINUTE);
    limiter.recordFailure("a");
    limiter.recordFailure("a");
    advance(10 * MINUTE + 1);
    expect(limiter.retryAfterSeconds("a")).toBe(0);
  });

  it("reports how long until the oldest failure expires", () => {
    const { limiter, advance } = setup(1, 10 * MINUTE);
    limiter.recordFailure("a");
    advance(4 * MINUTE);
    expect(limiter.retryAfterSeconds("a")).toBe(6 * 60);
  });

  it("clears a client's failures after a successful login", () => {
    const { limiter } = setup(2);
    limiter.recordFailure("a");
    limiter.reset("a");
    limiter.recordFailure("a");
    expect(limiter.retryAfterSeconds("a")).toBe(0);
  });

  it("does not grow without bound", () => {
    const { limiter, advance } = setup(5, MINUTE);
    for (let i = 0; i < 2000; i++) limiter.recordFailure(`client-${i}`);
    advance(2 * MINUTE);
    limiter.recordFailure("fresh");
    expect(limiter.size()).toBeLessThan(10);
  });
});

describe("clientKey", () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it("uses the first address a proxy reports", () => {
    expect(clientKey(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientKey(headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
  });

  it("falls back to one shared key when there is no proxy header", () => {
    expect(clientKey(headers({}))).toBe("direct");
  });
});

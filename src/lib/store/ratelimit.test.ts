/**
 * The in-memory fallback path (no UPSTASH_/KV_ env vars set in this test run, matching the repo's
 * default vitest environment), which is what local dev and any deploy without KV attached uses.
 */
import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, __resetRateLimitMemoryForTests } from "./ratelimit";

afterEach(() => {
  __resetRateLimitMemoryForTests();
});

describe("checkRateLimit, in-memory fallback", () => {
  it("allows up to the limit, then blocks with a positive Retry-After", async () => {
    const key = "test:basic";
    for (let i = 0; i < 3; i++) {
      const v = await checkRateLimit(key, 3, 60);
      expect(v.allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  it("different keys never share a counter", async () => {
    const a = "test:a";
    const b = "test:b";
    for (let i = 0; i < 5; i++) {
      const v = await checkRateLimit(a, 5, 60);
      expect(v.allowed).toBe(true);
    }
    // b's own budget is untouched by a's five requests.
    const first = await checkRateLimit(b, 5, 60);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(4);
  });

  it("the window resets: after it elapses, the counter starts over", async () => {
    const key = "test:window";
    const v1 = await checkRateLimit(key, 1, 0.05); // 50ms window
    expect(v1.allowed).toBe(true);
    const v2 = await checkRateLimit(key, 1, 0.05);
    expect(v2.allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    const v3 = await checkRateLimit(key, 1, 0.05);
    expect(v3.allowed).toBe(true);
  });
});

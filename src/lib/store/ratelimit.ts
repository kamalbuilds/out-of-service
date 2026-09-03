/**
 * A simple fixed-window rate limiter: INCR a per-window key, EXPIRE it the first time it's
 * created, and reject once the count passes the limit. Uses the same Upstash/Vercel KV REST
 * credentials the trip store uses (`redisRestCredentials()`), so a single Vercel project with KV
 * attached gets a limiter that is shared across every serverless instance, no extra
 * infrastructure. When no KV env is configured (local dev, or a deploy that only wired Blob
 * storage), it falls back to a process-local in-memory counter: not shared across instances, but
 * still enough to stop a single hammering client in dev, and it never throws the request into a
 * 500 just because the rate limiter itself has no backend.
 *
 * Deliberately not exact: two concurrent requests can both read count N and both proceed before
 * either write lands (a classic check-then-act race). That is an acceptable trade for "stop
 * obvious abuse, cheaply" rather than a hard billing-grade quota; a burst of a handful of extra
 * requests at the boundary is not the failure mode this guards against.
 */
import { redisRestCredentials } from "./backend";

export type RateLimitVerdict = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds the caller should wait before retrying. 0 when allowed. */
  retryAfterSeconds: number;
};

async function redisCmd(url: string, token: string, args: (string | number)[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ratelimit: redis ${String(args[0])} failed with HTTP ${res.status}`);
  }
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`ratelimit: redis error: ${json.error}`);
  return json.result;
}

async function checkRedis(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitVerdict> {
  const creds = redisRestCredentials();
  if (!creds) throw new Error("ratelimit: no redis credentials configured");
  const rateKey = `oos:rl:${key}`;
  const count = Number(await redisCmd(creds.url, creds.token, ["INCR", rateKey]));
  if (count === 1) {
    await redisCmd(creds.url, creds.token, ["EXPIRE", rateKey, windowSeconds]);
  }
  if (count > limit) {
    const ttl = Number(await redisCmd(creds.url, creds.token, ["TTL", rateKey]));
    return { allowed: false, limit, remaining: 0, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  }
  return { allowed: true, limit, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
}

/** Process-local fallback. Keyed globally so hot-reload in dev reuses the same map. */
const globalMem = globalThis as unknown as {
  __oosRateLimitMem?: Map<string, { count: number; resetAt: number }>;
};
globalMem.__oosRateLimitMem ??= new Map();
const memory = globalMem.__oosRateLimitMem;

function checkMemory(key: string, limit: number, windowSeconds: number): RateLimitVerdict {
  const now = Date.now();
  const existing = memory.get(key);
  if (!existing || now >= existing.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, limit, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, limit, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/**
 * `key` should already carry its own namespace (e.g. `ip:1.2.3.4:trip-action` or
 * `trip:abc123:action`) since all callers share one counter space.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitVerdict> {
  if (redisRestCredentials()) {
    try {
      return await checkRedis(key, limit, windowSeconds);
    } catch (err) {
      // A rate-limiter outage must never take the API down with it: fall through to the
      // in-memory counter for this request rather than 500ing or silently allowing everything.
      // Logged (not swallowed silently) so a persistent KV outage is visible in production logs.
      console.error("[ratelimit] redis path failed, falling back to in-memory limiter:", err);
    }
  }
  return checkMemory(key, limit, windowSeconds);
}

/** First value of `x-forwarded-for`, or "unknown" when the header is absent (e.g. local dev). */
export function clientIp(request: Request): string {
  const header = request.headers.get("x-forwarded-for") ?? "";
  const first = header.split(",")[0]?.trim();
  return first || "unknown";
}

/** Test-only: clears the in-memory fallback counters between test cases. */
export function __resetRateLimitMemoryForTests(): void {
  memory.clear();
}

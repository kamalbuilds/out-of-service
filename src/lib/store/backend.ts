/**
 * Key/value backends for trip state. Chosen at runtime from env var NAMES only.
 * No values are ever logged. No new dependencies: every remote backend is
 * plain `fetch` against its documented REST API.
 */

export type BackendName = "upstash-redis" | "vercel-kv" | "vercel-blob" | "memory";

export interface StoreBackend {
  name: BackendName;
  detail: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

/* ------------------------------------------------------------------ */
/* Upstash / Vercel KV (identical REST protocol)                       */
/* ------------------------------------------------------------------ */

function redisRest(name: BackendName, url: string, token: string): StoreBackend {
  const base = url.replace(/\/$/, "");
  async function cmd<T>(args: (string | number)[]): Promise<T> {
    const res = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(
        `store: ${name} command ${String(args[0])} failed with HTTP ${res.status}`,
      );
    }
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error) throw new Error(`store: ${name} error: ${json.error}`);
    return json.result as T;
  }
  return {
    name,
    detail: `${new URL(base).host} (REST)`,
    async get(key) {
      return (await cmd<string | null>(["GET", key])) ?? null;
    },
    async set(key, value) {
      await cmd(["SET", key, value]);
    },
    async keys(prefix) {
      return (await cmd<string[]>(["KEYS", `${prefix}*`])) ?? [];
    },
  };
}

/* ------------------------------------------------------------------ */
/* Vercel Blob                                                         */
/* ------------------------------------------------------------------ */

const BLOB_API = "https://blob.vercel-storage.com";

function vercelBlob(token: string): StoreBackend {
  const urlCache = new Map<string, string>();

  async function resolve(key: string): Promise<string | null> {
    const cached = urlCache.get(key);
    if (cached) return cached;
    const res = await fetch(`${BLOB_API}/?prefix=${encodeURIComponent(key)}&limit=1`, {
      headers: { Authorization: `Bearer ${token}`, "x-api-version": "7" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`store: blob list failed with HTTP ${res.status}`);
    const json = (await res.json()) as { blobs?: { pathname: string; url: string }[] };
    const hit = json.blobs?.find((b) => b.pathname === key);
    if (!hit) return null;
    urlCache.set(key, hit.url);
    return hit.url;
  }

  return {
    name: "vercel-blob",
    detail: "blob.vercel-storage.com (REST, 60s edge cache on reads)",
    async get(key) {
      const url = await resolve(key);
      if (!url) return null;
      const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`store: blob get failed with HTTP ${res.status}`);
      return await res.text();
    },
    async set(key, value) {
      const res = await fetch(`${BLOB_API}/${key}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
          "x-content-type": "application/json",
          "x-add-random-suffix": "0",
          "x-cache-control-max-age": "0",
        },
        body: value,
      });
      if (!res.ok) throw new Error(`store: blob put failed with HTTP ${res.status}`);
      const json = (await res.json()) as { url?: string };
      if (json.url) urlCache.set(key, json.url);
    },
    async keys(prefix) {
      const res = await fetch(`${BLOB_API}/?prefix=${encodeURIComponent(prefix)}`, {
        headers: { Authorization: `Bearer ${token}`, "x-api-version": "7" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`store: blob list failed with HTTP ${res.status}`);
      const json = (await res.json()) as { blobs?: { pathname: string }[] };
      return (json.blobs ?? []).map((b) => b.pathname);
    },
  };
}

/* ------------------------------------------------------------------ */
/* In-memory (dev only)                                                */
/* ------------------------------------------------------------------ */

const globalMem = globalThis as unknown as { __oosMem?: Map<string, string> };

function memory(): StoreBackend {
  globalMem.__oosMem ??= new Map<string, string>();
  const map = globalMem.__oosMem;
  return {
    name: "memory",
    detail: "process-local Map, lost on restart, not shared between serverless instances",
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async keys(prefix) {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

const globalBackend = globalThis as unknown as { __oosBackend?: StoreBackend };

export function backend(): StoreBackend {
  if (globalBackend.__oosBackend) return globalBackend.__oosBackend;

  const env = process.env;
  let chosen: StoreBackend;

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    chosen = redisRest(
      "upstash-redis",
      env.UPSTASH_REDIS_REST_URL,
      env.UPSTASH_REDIS_REST_TOKEN,
    );
  } else if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    chosen = redisRest("vercel-kv", env.KV_REST_API_URL, env.KV_REST_API_TOKEN);
  } else if (env.BLOB_READ_WRITE_TOKEN) {
    chosen = vercelBlob(env.BLOB_READ_WRITE_TOKEN);
  } else {
    chosen = memory();
    console.warn(
      "[out-of-service] STORE BACKEND = in-memory Map. Trip state is NOT shared " +
        "between processes and is lost on restart. Set UPSTASH_REDIS_REST_URL + " +
        "UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN, or " +
        "BLOB_READ_WRITE_TOKEN to use a real backend.",
    );
  }

  globalBackend.__oosBackend = chosen;
  return chosen;
}

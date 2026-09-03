# Jude Gao — Next.js core team, Vercel

Lens: I read this the way I read a PR against `vercel/next.js` examples: does the App Router get
used for what it's for, does anything trust the client for something the server should decide, is
the SSE lifecycle actually cleaned up or just closed on the happy path, and would I be comfortable
this ships on someone's Vercel project without a postmortem. 20-minute budget, no browser: repo
read plus `npx vitest run`, `npx tsc --noEmit`, and curl against the live deployment.

## 1. What I did

- Read every route under `src/app/api/**` and both dynamic pages (`src/app/page.tsx`,
  `src/app/t/[tripId]/page.tsx`), `src/lib/store/{index,backend,actions}.ts`,
  `src/components/trip/TripProvider.tsx`, `src/components/webmcp/WebMCPTools.tsx`,
  `src/lib/webmcp/{runtime,register}.ts`, `next.config.ts`, `package.json`, `vitest.config.ts`.
- Ran the test and type-check gates myself:
  - `npx vitest run` → **5 files, 118 tests, 118 passed**, 1.13s.
  - `npx tsc --noEmit` → **zero errors**, clean exit.
- Hit the live deployment directly rather than trusting the docs:
  - `GET /api/health` → `200`, real numbers: `store.backend: "vercel-kv"` (Upstash-backed, not the
    in-memory fallback), `index.rows: 695`, `live.outages: 92`, `routing.graph.nodes: 123`.
  - `POST /api/trip` with the demo pair (Times Sq-42 St → 34 St-Penn Station, wheelchair) → `201`,
    three scored candidates, a `companionUrl`.
  - `POST /api/trip/<id>/action` as **companion** with `type: "accept_reroute"` → `403`, `"Only
    the rider can accept reroute..."`. Same for `type: "accept_route"` → `403`. Confirms the demo's
    central claim: a companion cannot accept, server-side, not just hidden client-side.
  - `POST ... role: "rider"` for `accept_route` → `200`, `trip.version` went `1 → 2`; a duplicate
    accept at the same version went `2 → 3` cleanly (optimistic version bump, no corruption).
  - `POST ... type: "propose_reroute"` as **rider** → `403`, correctly companion-gated.
  - **Then the finding that matters**: `POST /api/trip/<id>/action` with the `role` field omitted
    entirely → `200`, and `accept_route` (a rider-only action) executed. `src/lib/adapters/input.ts:16`:
    `export function parseRole(raw: unknown): Role { return raw === "companion" ? "companion" :
    "rider"; }`. `role` is a bare string in the POST body, chosen by whoever sends the request, with
    no session, cookie, or per-link token behind it. The `companionUrl` (`/t/<id>?role=companion`)
    is a UI convenience, not a capability: anyone who has the trip id (visible in both links) can
    call the action endpoint with `role: "rider"` and get every rider power, including
    `accept_reroute`, `accept_route`, `report`. `docs/WEBMCP.md:261` states "The tool list is not
    the security boundary... `POST /api/trip/:id/action` re-checks the role server-side... the
    server-side role check is the part that actually holds" — that claim is true only for a caller
    that *honestly* declares itself companion; it is not true against a caller that simply asserts
    `role: "rider"`, which is exactly the shape of the attack the doc is trying to rule out.
  - `curl -N --max-time 8 .../api/trip/<id>/stream` → clean `event: trip` with the current row
    immediately, `: keepalive vN` comments on tick, correct `Content-Type: text/event-stream;
    charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
  - `curl .../api/live/stream` for 8s → one `event: snapshot` with the full outage list, well-formed
    SSE framing, connection still open at the 8s cutoff (expected, self-closes at 5 minutes per
    `src/app/api/live/stream/route.ts:15`).
  - Headers: `/` → `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` (correct
    for a per-request dynamic RSC page); `/api/health`, `/api/trip/[id]` →
    `cache-control: public, max-age=0, must-revalidate` — functionally harmless (`max-age=0` forces
    revalidation) but `public` on a response containing another user's notes/reports is the wrong
    default; should be `private`, given `dynamic = "force-dynamic"` is already declared per route.
  - `POST /api/trip/<id>/action` for a nonexistent trip → `400` (`ActionError`), not `404` — a small
    status-code miss inside `applyAction`'s `if (!trip) throw new ActionError(...)`, the trip is a
    path resource so its absence is a `404`, not a client-body validation error.

## 2. Scores (1–5)

| Criterion | Score | Why |
|---|---|---|
| WebMCP Leverage | 5/5 | `WebMCPTools.tsx:96-131` gets the hard part right: a `generationChain` promise serializes register → `whenToolsIdle()` → `AbortController.abort()` → next register, so overlapping generations never collide on tool names and a mutation mid-call can't unregister a tool still returning its result; the registration effect keys on `role, tripId, version, pendingCount, brokenKey` — observable state, never React object identity — which is the correct dependency array for something that must also fire `toolchange` deterministically. |
| Execution | 3/5 | The product runs end to end on real infra (Vercel KV live in prod, 118/118 tests, clean `tsc`, real SSE), but `src/lib/adapters/input.ts:16`'s `parseRole` means the documented trust boundary ("the server-side role check is the part that actually holds") is weaker than claimed: role is an unauthenticated client-supplied string, not bound to which link the caller holds, so the one security property the whole two-agent pitch rests on doesn't fully hold against an adversarial caller, only an honest one. |
| Potential Impact | 4/5 | Real, specific, checkable: a route scored on `EL290X`'s actual 24-month availability and a live `currentlyOut` flag, not a synthetic accessibility score; the audience (a wheelchair user and a companion coordinating a subway trip) and the failure mode (an elevator dies mid-transfer) are named and demonstrated, not asserted. |
| Creativity & Ambition | 4/5 | Two roles, two tool lists, one origin, no second deployment, and a real human-gated write path (`propose_reroute` → `accept_reroute`) is a genuinely different shape from a single-agent CRUD wrapper; docked because the role-separation idea is more ambitious than its current server-side implementation of it. |

**Total: 16/20**

## 3. The one change that moves my score up

`src/lib/adapters/input.ts:16` and `src/app/api/trip/[id]/action/route.ts:24`: stop trusting
`body.role`. Mint a per-link opaque token at `createTrip` (`src/lib/store/index.ts:70`, alongside
`newTripId()`) — one for the rider URL, one for `companionUrl` — store both on the `Trip` record,
and have the action route resolve role from the presented token (header or body) via a server-side
lookup, falling back to reject if absent, instead of `parseRole` trusting whatever string arrives.
That turns "the server-side role check is what actually holds" from a true statement about honest
callers into a true statement about all callers, which is the actual bar for a submission whose
pitch is "an agent can hold a role it can't escalate out of."

## 4. What would make me distrust this

I'd distrust it if the README or DEVPOST claimed the server-side role check is a real security
boundary without qualification — it doesn't; `docs/WEBMCP.md:287` is explicit that the confirm
card is not a capability boundary and names `webmcp#288`. That kind of self-report is why I still
land at 16 and not lower. But the same document overstates the *other* half: it says the
server-side check "is the part that actually holds," and my curl test shows it holds only against
an agent that tells the truth about its own role, not against one that doesn't — which is the
precise threat model WebMCP tool-scoping is supposed to defend against. If I found that gap
un-disclosed in a resubmission after this review, that would move me to actively distrust the
project's security claims rather than just score them lower.

## 5. Total

**16/20**

## Re-score after fixes (14:50 UTC)

Same rules as the first pass: repo read plus `npx vitest run`, `npx tsc --noEmit`, curl against
the live deployment. No browser, 15-minute budget this time.

### What I verified

- `npx vitest run` → **9 files, 153 tests, 153 passed**, up from 118 in 5 files. The new file is
  `src/lib/store/actions.test.ts`, and it tests the exact gap I found: missing key, a guessed key,
  the rider key on a companion-only action, the companion key on a rider-only action, and retry
  exhaustion returning a `409` with a message an agent can act on, all against the real store and
  the real route handlers, not mocks of them.
- `npx tsc --noEmit` → clean exit, zero errors.
- `src/lib/store/actions.ts:50-58` (`roleForKey`) replaces `parseRole`: role is looked up from
  `trip.riderKey` / `trip.companionKey`, not read off the request body. `applyAction`
  (line 253-onward) calls `roleForKey(trip, key)` before `assertRole`, and 403s with `role === null`
  when the presented key matches neither.
- Created a trip live: `POST /api/trip {"from":"611","to":"318","constraints":{"wheelchair":true}}`
  → `201`, id `kwpoe6v7ut`, `riderKey: "d2uW_W..."`, `companionKey: "J6Gb_C..."` in the response
  envelope, but inside the embedded `trip` object itself both fields are already `""` — stripped
  at the source, not redacted downstream.
- No key at all:
  ```
  POST /api/trip/kwpoe6v7ut/action {"type":"accept_route","payload":{"routeId":"r_084d19bd"}}
  -> 403 {"error":"This link's key does not match this trip. Use the rider or companion URL
     exactly as it was shared; a guessed or edited key is not a valid credential."}
  ```
- Companion key on a rider-only action:
  ```
  POST .../action {"type":"accept_reroute","key":"J6Gb_...","payload":{"proposalId":"p_x"}}
  -> 403 {"error":"Only the rider can accept reroute. ..."}
  ```
- Rider key on a companion-only action:
  ```
  POST .../action {"type":"propose_reroute","key":"d2uW_...","payload":{"routeId":"r_084d19bd","reason":"test"}}
  -> 403 {"error":"Only the companion can propose reroute. ..."}
  ```
- `GET /api/trip/kwpoe6v7ut` → body has `"riderKey":"","companionKey":""`, neither actual key
  string appears anywhere in the response bytes. `Cache-Control: private, no-store` on this route
  — the exact header I flagged as `public` last time is gone; `src/lib/http.ts` now centralizes
  `PRIVATE_NO_STORE` so both `/api/trip/:id` and the action route can't drift apart again.
- The 404 miss I called out is fixed: `applyAction` now does
  `if (!trip) throw new ActionError(..., 404)` (`src/lib/store/actions.ts:255`), and live:
  `POST /api/trip/does-not-exist-xyz/action {...} -> 404 {"error":"No trip with id \"does-not-exist-xyz\"."}`.
- Oversized note, sent straight to the HTTP layer, no browser: `POST .../action
  {"type":"note","key":"<riderKey>","payload":{"text":"<600 A's>"}}` → `400 {"error":"note text is
  600 characters, over the 500-character limit. Shorten it and try again."}` — a real validation
  error, not the silent `.slice(0, 500)` truncation I'd have let through unnoticed before.
- Concurrency: 70 concurrent POSTs to the same trip, `xargs -P 20` → `26x 200, 28x 409, 16x 429`
  on a live run. The 409s are retry-exhaustion doing exactly what
  `src/lib/store/actions.ts`'s trailing comment says it should: "a 409, an agent can re-`get_trip`
  and retry, not a 500 that reads like the server is broken." No 500s anywhere in the burst.

### Scores

| Criterion | Score | Why |
|---|---|---|
| WebMCP Leverage | 5/5 | Unchanged from my first pass — the `generationChain` serialization in `WebMCPTools.tsx` was already the strongest part of this submission and the fix didn't touch it. |
| Execution | 4/5 | The one gap that broke my confidence in the trust story — role as an unauthenticated string — is closed by a real capability token checked server-side, with tests that exercise the route handlers directly; still 4 and not 5 because the 429 path I forced returns no `Retry-After`-aware guidance beyond the header itself, and the `public` cache-control class of bug now has one canonical fix point (`src/lib/http.ts`) but I'd still want a lint rule stopping a future route from hand-rolling its own headers. |
| Potential Impact | 4/5 | Unchanged: the routing problem and the demonstrated failure mode were never the weak point. |
| Creativity & Ambition | 5/5 | Raised from 4: the role-separation idea now has a server-side implementation that matches its ambition — two capability tokens minted once, never re-derivable from a guess, is the actual mechanism a two-agent product needs, not just the shape of one. |

**New total: 18/20**

### Next thing that would move the score

`src/app/api/trip/[id]/action/route.ts`: the two rate-limit checks (IP and trip) run sequentially
before the body is parsed, which is correct, but both go to the same `checkRateLimit` call shape
with no distinction between a read-adjacent action (`watch`, `note`) and a write that contends on
`optimistic-concurrency` (`accept_route`, `accept_reroute`). Splitting the trip-scoped limit so
`accept_reroute`/`accept_route` get a tighter ceiling than `note`/`watch` would make the 409-vs-429
distinction under load legible to an agent deciding which action to retry first, and would be the
next thing I'd pull up in DevTools if I had the browser budget for it.

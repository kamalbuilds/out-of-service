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

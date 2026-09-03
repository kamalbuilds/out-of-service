# UI, store and API

Everything a person or an agent touches in this app, and how to check it still works.

## Pages

| Route | What it is |
|---|---|
| `/` | Product name, one-line subtitle, the live ADA-outage strip, and the create-trip form with two searchable station pickers. Server-rendered from the index and the live feed on every request. |
| `/t/[tripId]` | The shared trip. Two columns: trip on the left, live on the right. Role is derived from the `?k=` capability key, never from `?role=`. |
| `/t/[tripId]` (not found) | A trip id that is not in the store returns 404 with a page that says so. |
| `/t/[tripId]` (bad key) | A `?k=` that matches neither the trip's rider nor companion key renders "This link is not valid" with no trip data. |

Every trip has two URLs, both minted once at creation and shown only there (and, for the
companion link, again to the rider session that created it): the rider URL is
`/t/<tripId>?k=<riderKey>`, the companion URL is `/t/<tripId>?k=<companionKey>`. The key is a
capability, not a display setting: it is what the server checks before deciding which role's
data and actions this session gets. `?role=` in the query string is a harmless display hint only
now and decides nothing. `?demo=1` adds the demo control to a rider window; the simulated outage
it sets is trip state (`trip.simulatedOut`), shared with the companion window over the same SSE
stream, not local to one tab. Nothing else is read from the query string.

### `/` home

- The live strip reads `GET /api/live` server-side and shows **N ADA elevators out right now**
  with the three longest-running of them and a link to the MTA's own status page. The count is a
  provenance expander: open it for the dataset, the feed URL, the row count and the fetch time.
- Station pickers are a filter box over a `<select size=6>` listing accessible stations from
  `GET /api/stations`. The value submitted is the station complex id, so the server never guesses
  which "86 St" was meant. The name, the line bullets, the elevator count and the worst tier of
  the selected station are shown under the picker.
- Submitting posts to `POST /api/trip` and navigates to `/t/<id>`.

### `/t/[tripId]`

Left column: from/to, the constraints as chips, the tier legend, every candidate route as a route
strip (line bullets, stop counts, the elevators the route depends on as tier-coloured chips, the
risk score and the explanation naming the weakest elevator), the accepted route inverted to black,
and the proposals list. **Accept and reject buttons render for the rider only**; the companion gets
a reason field and a "propose" button on each route instead. The companion link with a copy button
renders for the rider only.

Right column: the outages on this trip's elevators with hours out and estimated return, the watch
list, the shared timeline with a note box, the rider-only report form, the `WebMCPTools` panel
(WebMCP layer badge plus the tools registered in *this* session, which is how the two windows
visibly differ), and the demo control when `?demo=1`.

Every number that came from data carries its source. Click or tab to any dotted value and the
dataset, the exact query and the row count open underneath it.

## Store

`src/lib/store` picks a backend at runtime from env var **names** only; no value is ever read into
a log line.

| Order | Condition | Backend |
|---|---|---|
| 1 | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis over its REST API |
| 2 | `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV (same REST protocol) |
| 3 | `BLOB_READ_WRITE_TOKEN` | **Vercel Blob. This is what production runs.** |
| 4 | none of the above | in-memory `Map`, with a loud `console.warn` on first use |

Production is Vercel Blob, provisioned by the bootstrap agent (see `docs/BOOTSTRAP.md`). Confirm
with `GET /api/health` -> `store.backend`.

Every backend is **append-only and versioned**: a trip version is written once, to its own key, and
writing a version that already exists fails rather than overwriting.

- Blob: one immutable object per version at `trips/<id>/<version padded to 6>.json`, written with
  `x-add-random-suffix: 0` and no overwrite header, so a duplicate version comes back `409`. Reads
  `list({prefix: "trips/<id>/"})` (an API call, immediately consistent) and fetch the highest
  version's URL. A version is always a new URL, so the 60-second CDN cache on a blob URL can never
  serve a stale trip. Each instance memoises the last version it fetched, so the 2-second SSE poll
  costs one `list` and no body fetch when nothing changed.
- Redis/KV: `SET oos:trip:<id>:v<n> ... NX` plus a `head` pointer.

`putTrip` rejects a write whose version is not exactly `stored + 1` with a `StaleWriteError` naming
both versions. `applyAction` re-reads and re-applies up to four times on that error, so two agents
acting at once both land instead of one silently winning.

## API

| Route | Method | Notes |
|---|---|---|
| `/api/trip` | POST | `{from, to, constraints}`. Resolves both stations through the index, scores candidates with `findRoutes`, stores the trip at version 1. 201 with `{trip, companionUrl, notes, source}`. |
| `/api/trip/[id]` | GET | `{trip}` or 404. |
| `/api/trip/[id]/action` | POST | `{type, role, payload}`. **Role is enforced here, not in the UI.** |
| `/api/trip/[id]/stream` | GET | SSE. See below. |
| `/api/stations` | GET | `?q=` `?line=` `?limit=` list; `?station=` one station with its elevators, outages and score; `?equipment=` one elevator. Ids are served as both `id` and `complexId` so the UI and the tool layer read the same payload. |
| `/api/route` | POST | `{from, to, constraints}` -> scored routes, without creating a trip. |
| `/api/health` | GET | Index row/elevator/station counts, the routing graph stats, live coverage, the store backend, and the build time. |

### Role enforcement

`POST /api/trip/:id/action` takes `{type, key, payload}`. `key` is the capability token from the
caller's URL (`riderKey` or `companionKey`); role is derived from which one matches, and any
`role` field in the body is ignored. A key that matches neither 403s before the action type is
even checked.

| Action | rider key | companion key | no / wrong key |
|---|---|---|---|
| `accept_route`, `accept_reroute`, `report` | yes | **403** | **403** |
| `propose_reroute` | **403** | yes | **403** |
| `simulate` (needs `payload.demo === true` too) | yes | **403** | **403** |
| `watch`, `note` | yes | yes | **403** |

A 403 body is a sentence a model can act on, for example: *"Only the rider can accept route. You are
the companion: propose a reroute instead and the rider confirms it."* or *"This link's key does not
match this trip."* Hiding a tool from a session is a UI affordance; the key is the actual boundary.

Every accepted action appends a `TimelineEvent` and bumps `version` by one.

## SSE contracts

`GET /api/trip/[id]/stream`

- 404 if the trip does not exist, so a bad link fails loudly instead of hanging.
- Polls the store every **2 s**, emits `event: trip` with the whole trip **only when `version`
  changes**, and a `: keepalive vN` comment otherwise.
- Emits the current trip immediately on connect, so a reconnecting client never misses a version.
- `event: end` and a clean close at **5 minutes**; the client reconnects after 500 ms.
- `event: gone` if the trip disappears from the store.

`GET /api/live/stream` (live agent): `snapshot` on connect, `change` when the set of current outage
codes changes, `heartbeat` otherwise, 5-minute lifetime.

**Socket budget.** A browser allows six sockets per origin over HTTP/1.1. A trip page holds the trip
stream open for as long as it is open, and the live stream only while the tab is visible; hidden tabs
drop the live stream and resubscribe on return (the server's first event is a full snapshot, so
nothing is missed). Without that, three open trip tabs consume all six sockets and every other
request to the same dev server queues forever, including the POST that creates the next trip. This
was observed, not theorised.

## Demo flag

The demo control renders, rider window only, with `?demo=1` (or the server-side
`DEMO_OVERRIDES=1`). It forces one equipment code on this trip's routes to "out" as **trip
state, shared with the companion window**:

- a `simulate` action (`{code, on, demo: true}`, rider key required) appends the code to
  `trip.simulatedOut`, re-scores every candidate through the same scorer `/api/route` uses
  (`explainRoute` + `scoreRoute` against the live feed merged with the simulated codes), and
  bumps `version`, so both windows see the flip over the existing trip SSE stream, no reload;
- labelled `SIMULATED` on the chip, on the outage row, and as `simulated: true` plus a top-level
  note in every tool result that returns it (`route_accessible`, `compare_routes`,
  `station_status`, `current_outages`, `get_trip`);
- never written to the index, never sent to the MTA feed, and never accepted from the companion
  key or without `demo: true` — both 403;
- cleared by the "clear" button (a second `simulate` with `on: false`), which re-scores back to
  the live truth for both windows.

The real feed is the default and remains the default. The control exists so an on-camera reroute can
be forced if no elevator on the demo route happens to fail while the camera is running.

## Manual QA checklist

Two windows side by side, same trip.

1. `/` shows a non-zero ADA outage count and three example rows. Open the count: it names the feed
   URL and the row count.
2. Pick two stations, plan the trip. You land on the rider URL, `/t/<id>?k=<riderKey>`, with up
   to three routes, each with elevator chips coloured by tier, and an explanation naming the
   weakest elevator.
3. **Rider window** (`/t/<id>?k=<riderKey>`): header says *You are the rider* on black. Accept
   buttons on each route. Companion link (with its own key) and a copy button. Report form
   present.
4. **Companion window** (open the copied companion URL, `/t/<id>?k=<companionKey>`): header says
   *You are the companion* on MTA yellow. No accept buttons anywhere, no companion link, no
   report form. A reason field and a "propose" button per route instead. The WebMCP panel lists a
   different tool set.
5. Companion types a reason and proposes a route. **The rider window shows "1 pending proposal"
   within about two seconds with no reload**, and the version counter in the header goes up by one.
6. Rider accepts. Both windows show the new accepted route inverted to black, the proposal marked
   `accepted`, and two new timeline entries.
7. Companion presses an accept path anyway (via the API, with its own key): 403 with a sentence
   explaining the role. A caller with no key, or a guessed one, also 403s, on this or any action.
8. `?demo=1` on the rider window: pick an elevator on the route, simulate the outage. The chip
   turns black and struck through with `SIM`, the outage list gains a `SIMULATED` row, the route's
   risk score and broken state update for real, and **the companion window updates within about
   two seconds with no reload**, because the simulation is trip state now, not one tab's memory.
9. Open the rider URL with the key edited to something else: "This link is not valid", no trip
   content.
10. `GET /api/health`: `store.backend` is `vercel-blob` in production, `index.rows` is non-zero,
    and `live.stale` is `false`.

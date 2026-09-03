# QA run, 2026-09-03

Browser: harness profile `qa` (native WebMCP, `document.modelContext` present). Local dev server
`http://localhost:3000`. Production `https://out-of-service-sepia.vercel.app`.

Pre-check: `GET /api/health` on both local and production returned `ok:true`,
`store.backend: "vercel-blob"` on both, `index.rows: 695`, `live.stale: false` on both.
Production was already deployed and healthy at the start of this run, so step 10 is folded in
alongside the matching local steps rather than deferred.

Note on `bhn qa observe`: it buffers browser-wide (console/network) events since the last drain,
not per-tab. This profile had several stale tabs left open from a previous session
(`/t/sbv6es5wxk`, `/t/jufvmvw278` and their `?role=companion` twins, opened before this run
started). The first `observe` call after opening the home tab returned events that were actually
from those stale tabs (a hydration warning citing `pathname="/t/sbv6es5wxk"` while the active tab
was `/`). Findings below are attributed to the tab that actually produced them, cross-checked
against `state`/`text` output for that tab, not taken at face value from a raw `observe` call.

## 1. Home (`/`)

`bhn qa open http://localhost:3000/` -> new tab, `state`/`text` shows:

- **26 ADA elevators out right now**, three rows shown: `EL290X` (42 St/Port Authority, 675 days
  out), `EL132` (161 St-Yankee Stadium, 666 days out), `EL133` (161 St-Yankee Stadium, 666 days
  out), link to MTA's own status page. Footer: "123 accessible stations - 92 live outage rows".
  PASS (non-zero count, 3 rows, real link).
- Registered tools: `getTools()` is async (returns a `Promise<Tool[]>`, not a sync array — the
  checklist's `.map()` one-liner throws `TypeError: ...getTools(...).map is not a function` until
  awaited). Correct form: `await document.modelContext.getTools().then(ts=>ts.map(t=>t.name))`.
  Result on `/`: `["create_trip"]`. PASS — matches docs/WEBMCP.md (only the declarative
  `create_trip` form tool exists on the home page; the other 14 tools are trip-scoped).
- `observe` on this tab specifically (isolated from the stale-tab noise above): 0 console errors,
  0 http_errors, 0 network_failures attributable to `/`. One `Uncaught` exception was reported in
  the buffer at the moment of first drain, but it carries no stack/text; not counted against home.
  PASS. (Correction: the hydration warnings quoted above turned out **not** to be stale-tab noise
  — see the real bug in section 9. They were misattributed here at first because they cite
  `pathname="/t/sbv6es5wxk"`, a different tab, but the same warning reproduces on any trip page.
  Home itself (`/`) never renders the offending component, so home stays a clean PASS.)

## 2. Create the demo trip (Times Sq-42 St -> 34 St-Penn Station, wheelchair on)

Filled the two `StationPicker` selects via the UI's own filter boxes (`e3`/`e5`, narrowing each
`<select size=6>` to one match) then set `select.value` + dispatched a real `change` event, because
this harness's `click`/`fill` verbs cannot address individual `<option>` rows inside a multi-row
native `<select>` (no ref is exposed per-option, and `click`-by-text finds nothing — filed as a
harness gap, not an app bug). The resulting state update went through React's real `onChange`
(`StationPicker`'s `value`/`onChange` props), confirmed by the picker's own detail line updating:
"Times Sq-42 St ... worst tier unreliable" / "34 St-Penn Station A C E ... worst tier unreliable".
Wheelchair checkbox (`e7`) was already checked by default.

Clicked `PLAN THE TRIP` (`CreateTrip.tsx` -> `POST /api/trip`). **FAIL, blocking**: the button
went to "SCORING ROUTES" and stayed disabled indefinitely (>120s). Root-caused to two stacked
issues, confirmed independently:

1. **Socket budget (known, documented, reproduced live).** This `qa` profile had 5 stale trip tabs
   open from a prior session (`/t/sbv6es5wxk`, `/t/jufvmvw278`, `/t/yigem7smzy` and two
   `?role=companion` twins), each holding its `/api/trip/[id]/stream` SSE connection open. That's
   the exact scenario docs/UI.md's "Socket budget" section names: "three open trip tabs consume
   all six sockets and every other request to the same dev server queues forever, including the
   POST that creates the next trip. This was observed, not theorised." It reproduced again here:
   an in-page `fetch("/api/trip", ...)` issued via `eval` hung for the full 120s tool timeout with
   zero `PerformanceResourceTiming` entry ever recorded (i.e. never left the queue), while a
   parallel `curl` to the same endpoint from the shell answered in 89ms. Navigating all 5 stale
   tabs to `about:blank` (freeing their sockets) immediately unblocked the in-flight request, which
   then resolved. Not a code defect; a byproduct of this profile's leftover tabs, noted here
   because it will bite the same way in a real second-browser-window demo with more than a couple
   of trip tabs open on HTTP/1.1.
2. **The store itself is down for writes (this is the real, current, blocking defect).** Once
   unblocked, the POST resolved to **`HTTP 503 {"error":"store: blob put failed with HTTP 403.
   {\"error\":{\"code\":\"store_suspended\",\"message\":\"Store is suspended\"}}"}`**. Verified
   directly with curl, independent of the browser: `curl -X POST localhost:3000/api/trip -d
   '{"from":"611","to":"164","constraints":{"wheelchair":true}}'` -> `HTTP 503` with the same body,
   in 0.63s. **Production returns the identical error**: `curl -X POST
   https://out-of-service-sepia.vercel.app/api/trip ...` -> `HTTP 503`,
   `store_suspended`/"Store is suspended", in 1.56s. `GET /api/health` still reports
   `store.backend: vercel-blob` with no error because health only reads index/routing stats, never
   attempts a write. **No new trip can be created on local or production right now.** This is a
   Vercel Blob store-level suspension (billing/usage), not a code path this app controls; it is
   outside my fix authority (infra/billing, not a `src/` defect) and blocks every write in the
   product (create_trip, accept_route, accept_reroute, propose_reroute, add_note,
   report_broken_equipment, watch_equipment) on both environments. Flagging as the single
   highest-priority action item: reactivate/replace the Vercel Blob store (or point
   `BLOB_READ_WRITE_TOKEN` at a fresh store) before any further demo or judging.

Because trip creation is blocked, steps 2/4/6/7 below were completed against **pre-existing trips
already in the store from before this suspension** (`jufvmvw278`: 14 St -> Grand Central-42 St,
wheelchair; reads still succeed — the suspension blocks `put`, not `list`/fetch of already-stored
objects) rather than the fresh Times Sq -> Penn Station trip the checklist asked for. The intended
trip (`sbv6es5wxk`, Times Sq -> Penn, already exists from an earlier verified run per
docs/WEBMCP.md's "Verified in Chrome, 2026-09-03" section) was used for read-tool checks in step 8.
No route-strip evidence for the fresh EL228 scenario could be captured today because no fresh trip
can be written; the EL228-out fact itself was independently confirmed live via the
`elevator_history` tool (step 8).

## 3. Rider tools

Loaded existing trip `jufvmvw278` as rider (`/t/jufvmvw278`, role defaults to rider). Header:
"YOU ARE THE RIDER ... Your agent has accept_route, accept_reroute and report_broken_equipment."

`await document.modelContext.getTools().then(ts=>ts.map(t=>t.name))` -> 13 tools:

```
accept_reroute, accept_route, add_note, compare_routes, current_outages, elevator_history,
get_trip, list_accessible_stations, report_broken_equipment, route_accessible, share_trip,
station_status, watch_equipment
```

PASS: `accept_route`, `accept_reroute`, `report_broken_equipment`, `share_trip` present;
`propose_reroute` absent. This exactly matches the baseline already recorded in
docs/WEBMCP.md's "Verified in Chrome" section (byte-for-byte the same 13 names). Note:
`create_trip` is **not** expected here and its absence is correct, not a defect — it is a
declarative form-only tool that only exists on the home page's `<CreateTripForm>`; it never
registers on `/t/[id]` (the QA checklist's phrasing listing it alongside the trip-page tools was
imprecise, cross-checked against the WEBMCP.md tool table and the shipped `toolsForRole()` source).

## 4. Rider accepts a route (blocked by section 2's finding)

Clicked the UI's own "accept r_5f59f125" button (not the WebMCP tool, since accepting through the
declarative UI first is the natural path and it hits the same `POST /api/trip/:id/action` server
boundary). Button went to "accepting" (disabled) then reverted, and the page rendered the error
inline: `store: blob put failed with HTTP 403. {"error":{"code":"store_suspended","message":"Store
is suspended"}}`. Direct confirmation: `curl -X POST localhost:3000/api/trip/jufvmvw278/action -d
'{"type":"accept_route","role":"rider","payload":{"routeId":"r_5f59f125"}}'` -> **HTTP 500** (note:
`/api/trip` mapped the same underlying store error to 503; `/api/trip/[id]/action` maps it to 500 —
a minor status-code inconsistency between the two write endpoints, not worth a fix given the root
cause is external, but noted for whoever fixes the store). FAIL, same root cause as section 2; no
code defect beyond the 500-vs-503 inconsistency.

## 5. Companion tools

Loaded `/t/jufvmvw278?role=companion`. Header: "YOU ARE THE COMPANION ... Your agent has no accept
tool, and the server refuses an accept from this session."

`getTools()` -> 10 tools:

```
add_note, compare_routes, current_outages, elevator_history, get_trip,
list_accessible_stations, propose_reroute, route_accessible, station_status, watch_equipment
```

PASS: `propose_reroute` and `watch_equipment` present; `accept_reroute`, `accept_route`,
`create_trip`, `report_broken_equipment` all absent. Matches docs/WEBMCP.md's recorded baseline
exactly (same 10 names).

## 6. Companion proposes a route / rider accepts via SSE (blocked by section 2's finding)

Filled a route's reason field ("QA test reason: EL228 broken, try the A") and clicked "propose
r_5f59f125". Same failure as section 4, surfaced inline on the companion page: `store: blob put
failed with HTTP 403 ... store_suspended`. Confirmed the write never landed: back on the rider tab,
`accept_reroute`'s live-rebuilt description still read *"There are 0 pending proposals from your
companion right now, so there is nothing to accept yet. The accepted route r_bb3f722a is currently
usable."* (`r_bb3f722a` was accepted in a prior, pre-suspension session — its "currently usable"
live-state append is itself evidence the description-rebuild mechanism works correctly; only the
new proposal failed to persist because of section 2's root cause). The SSE/`toolchange` machinery
was not exercised end-to-end because there was nothing new to push. FAIL, same root cause; no new
code defect.

## 7. Rider report form

`document.querySelector('form[toolname=report_broken_equipment]').hasAttribute('toolautosubmit')`
-> **`false`**. PASS: confirms the declarative form is fill-then-human-submits, never
self-submitting, exactly as docs/WEBMCP.md specifies. (Did not attempt an actual submit: it would
hit the same store-suspended write path as sections 4/6, already proven.)

## 8. Read tools via the native API

On the rider tab, resolved the tool objects first (`window.__t = await
document.modelContext.getTools()`) since `executeTool`'s result and multi-step chains didn't
survive this harness's `eval` value-capture when nested in one expression; two-step eval worked
reliably and is a legitimate use of the same real `document.modelContext` API, just split across
calls.

`elevator_history` for `EL228`:

```
{"code":"EL228","station":"34 St-Penn Station","serving":"Penn Station concourse to downtown C/E
platform","tier":"unreliable","availability24m":0.9407863436593276,"unscheduled24m":35,
"entrapments24m":7,"currentlyOut":true,"estimatedReturn":"2026-09-05T02:00:00.000Z","source":
{"dataset":"rc78-7x78","query":"https://data.ny.gov/resource/rc78-7x78.json?$select=month,equipm
```

PASS: confirms `currentlyOut: true` for EL228, matching docs/DEMO-PLAN.md's live scenario exactly
(also matches the returned `estimatedReturn` of 2026-09-05, "Planned Work until 09/04 22:00" being
roughly consistent allowing for feed refresh between doc-write time and this run).

`current_outages` (`{adaOnly:true}`), first 300 chars:

```
{"outages":[{"equipment":"EL393","station":"Flushing Av","line":"M/J","serving":"Flushing Ave &
Broadway (SE corner) to mezzanine for service in both directions","reason":"Under
Investigation","ada":true,"outageDate":"2026-09-03T12:49:00.000Z","estimatedReturn":"2026-09-03T21
```

PASS: 27 ADA-only current outages returned (`count: 27`), includes `EL228` further down the list
with `reason: "Planned Work"`, `source.dataset: "MTA elevator/escalator live outage feed"`. Both
calls used `JSON.stringify(...)` as the second `executeTool` argument per the webmcp#278 finding
already documented in docs/WEBMCP.md (a plain object throws `UnknownError: Failed to parse input
arguments` in this Chrome build); confirmed that finding still holds today.

## 9. Console/network observation, both tabs, real bug found

Rider (`/t/jufvmvw278`) and companion (`/t/jufvmvw278?role=companion`) both show the same repeated
console errors, reproducible on demand (this is the bug the section-1 note above initially
misattributed to stale tabs — it is not stale-tab noise, it reproduces on this trip live):

```
console.error: In HTML, <summary> cannot be a descendant of <p>. This will cause a hydration error.
console.error: <p> cannot contain a nested <div>.
console.error: <p> cannot contain a nested <details>.
```

**Root cause, found and confirmed**: `src/components/trip/TripView.tsx` lines 290-302, the "no
elevator on this route is currently out" branch:

```tsx
{onRoute.length === 0 ? (
  <p className="px-3 py-3 text-sm">
    No elevator this trip depends on is out right now.
    <SourceNote ...>
      checked against {live?.outages.length ?? 0} live rows
    </SourceNote>
  </p>
) : ( ... )}
```

`SourceNote` (`src/components/ui/SourceNote.tsx:23-33`) renders `<details><summary>...</summary>
<div>...</div></details>` when it has provenance to show. `<details>`/`<summary>`/block-level
`<div>` are not permitted inside `<p>` per the HTML content model; the browser's own HTML parser
silently closes the `<p>` early during the server-rendered HTML parse, so React's client render
doesn't match what the browser actually built from the SSR markup, producing a genuine hydration
error on every trip whose route currently has zero live outages (i.e. the common case, since most
trips are fine most of the time). This is a **real, reproducible defect**, hit on this run's
`jufvmvw278` trip (which has no live outage on its route) and **not** present on trips with at
least one live outage on their elevators (that branch uses a `<ul>`/`<li>`, not a `<p>`, per
TripView.tsx:304+, so it's unaffected).

**Not fixed here per the orchestrator's scope note**: this file is a trip-page component the
design agent is about to rebuild; the fix is a one-tag change (`<p>` -> `<div>` at line 291, and
the closing tag at 302), no styling/class/copy change needed, but it lives in a component file
this task was told to leave to that agent. Flagging with exact file:line so it isn't lost:
**`src/components/trip/TripView.tsx:291` and `:302`**, change the wrapping element from `<p>` to
`<div>` (`SourceNote`'s own className already carries `inline-block`, so the visual result is
unchanged; only the tag name needs to change).

Final counts after all interaction on both tabs: rider tab 271 buffered events / 7 console errors
(all the same repeated hydration warning) / 2 uncaught exceptions (no stack text, likely React's
own hydration-error-boundary logging) / 0 http_errors / 0 network_failures; companion tab 51
events / same 7 console errors / 2 exceptions / 0 http_errors / 0 network_failures. The one
`log.error` network entry on each tab is the expected 500 from section 4/6's blocked write, not an
unexpected failure. **Blind spot**: `bhn qa observe` drains a browser-wide buffer, not a per-tab
one (see the section-1 note); it was cross-checked against `state`/`text` for the active tab each
time, but a truly tab-isolated signal was not directly available from this harness.

## 10. Production

`GET https://out-of-service-sepia.vercel.app/api/health` -> `ok:true`, `store.backend:
"vercel-blob"`, `index.rows: 695`, `live.stale: false` — healthy, matches local.

- **Step 1 (home)**: opened in the `qa` profile. "27 ADA elevators out right now", same 3
  longest-running rows (EL290X/EL132/EL133), footer "123 accessible stations - 91 live outage
  rows" (one fewer than local's 92 at the moment of the check — live feed refreshed between the
  two fetches, expected). `getTools()` -> `["create_trip"]`, matching local. PASS.
- **Step 2 (create trip)**: `curl -X POST https://out-of-service-sepia.vercel.app/api/trip ...` ->
  **HTTP 503**, identical `store_suspended` body to local. Same blocking defect, confirmed present
  on production independently of the local dev server. FAIL, same root cause as section 2 above.
- **Steps 3/5 (rider/companion tool lists on a trip page)**: **not executable on production** —
  no trip can be created (blocked, see above) and `jufvmvw278`/`sbv6es5wxk` (the local trip ids
  used for steps 3/5) return nothing on production, meaning production's Blob store is a distinct
  store/namespace from local's, not shared. No known existing production trip id was available to
  load `/t/<id>` or `/t/<id>?role=companion` there. This part of step 10 could not be completed;
  the rider/companion tool-registration code path is identical to local's (same deployed build,
  confirmed via matching `buildTime` proximity and identical `index.rows`/`routing.graph` in both
  health responses), so there is no reason to expect it differs, but it was not directly observed
  on production this run.

## Test suite

`npx vitest run src/lib/webmcp evals` -> **85 tests passed (2 files)**. No `src/` edits were made
during this run (the one real defect found, section 9, was left for the design agent per scope),
so `npx tsc --noEmit` was not re-run against new changes; the repo's test suite passing is the
pre-existing baseline, not evidence this run changed anything.

## Summary of findings, ranked

1. **Blocking, external, highest priority**: Vercel Blob store is suspended (`store_suspended`,
   HTTP 403 on `put`) on **both** local and production. Every write in the product is down:
   `create_trip`, `accept_route`, `accept_reroute`, `propose_reroute`, `add_note`,
   `report_broken_equipment`, `watch_equipment`. Reads (`GET`, `list`) still work. This needs a
   Vercel Blob store reactivation/replacement before any further demo, judging, or QA of the write
   paths — outside this agent's fix authority (infra/billing, not a `src/` code defect).
2. **Real, reproducible, small, deferred to the design agent**: `src/components/trip/TripView.tsx`
   lines 291 and 302 wrap a `<SourceNote>` (which renders `<details>/<summary>`) inside a `<p>`,
   which is invalid HTML and causes a genuine React hydration error on every trip whose route has
   zero live outages. One-tag fix (`<p>` -> `<div>`), not applied here per scope (component/layout
   file reserved for the design rebuild).
3. **Minor, not worth fixing alone**: `POST /api/trip` maps a store-put failure to HTTP 503;
   `POST /api/trip/[id]/action` maps the identical underlying error to HTTP 500. Inconsistent but
   both are correctly treated as failures by the client; only worth reconciling while someone is
   already touching the store error-handling path for finding 1.
4. **Harness/process note, not an app defect**: this `qa` profile carried 5 stale trip tabs from a
   previous session, which (per docs/UI.md's own documented socket-budget behavior) queued a new
   `POST /api/trip` for >120s until they were cleared. Worth remembering for any live demo: don't
   leave old trip tabs open in the same browser profile.


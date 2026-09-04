# Out of Service

**Two people, two agents, one page.** A rider in a wheelchair and the companion tracking their trip
open the same trip and get different tools, registered per session from inside the page and
enforced server-side by the trip's capability key. The rider can accept a route or a reroute. The
companion's agent can only propose one, and a forged accept presented with the companion's key is
rejected.

Step-free NYC subway routing, scored on how often the specific elevators a route depends on have
actually failed: eleven years of MTA outage history joined to the live outage feed.

Live: https://out-of-service-sepia.vercel.app
Repo: https://github.com/kamalbuilds/out-of-service (MIT)
Demo video (2:39): https://youtu.be/Ui_1FORk94w

## Why this matters

New York's subway has 160 accessible stations out of 472
(https://www.mta.info/article/accessibility-disability-pride-month-2026,
https://gothamist.com/news/mta-settles-suit-to-make-subway-elevators-more-reliable), and almost
every one of them depends on an elevator. Advocates counted at least 25 elevator outages a day,
median about four hours (Gothamist, same URL). If the one you need is out, you find out standing in
front of it, and the person tracking your trip can only text.

The MTA status page says what is broken this minute, never what breaks often. Checking whether the
F out of Court Sq is a safe bet takes four equipment-code lookups across two MTA pages and about
two minutes of cross-referencing; here, one `route_accessible` call returns three routes scored,
each with its elevators' 24-month history attached, in under a second.

In July 2026 a class action about exactly this settled. CIDNY v. MTA now requires the MTA to give
advance notice of elevator outages, platform announcements every 15 minutes and real-time alternate
accessible routes (https://dralegal.org/press/ny-subway-elevators-settlement/). The obligation
exists now. The thing a rider actually holds does not.

## What it does

1. The rider opens `/`, picks two accessible stations and their constraints, and is redirected to
   their own rider URL (`/t/<tripId>?k=<riderKey>`), which carries the companion link
   (`/t/<tripId>?k=<companionKey>`) with its own capability key.
2. The rider's agent calls `route_accessible`. It gets back up to three routes. Each one lists
   the specific elevators it depends on, each elevator's reliability tier, its 24-month numbers,
   and the exact query those numbers came from.
3. The rider accepts a route with `accept_route`. A confirmation card appears in the page and the
   tool call does not resolve until a human presses Confirm.
4. The companion opens the link on their own machine. Their session registers `propose_reroute`
   and `watch_equipment`. It does not register `accept_route`, `accept_reroute`, `share_trip` or
   the declarative `report_broken_equipment`. DevTools shows 10 tools in that window against 13
   in the rider's, on the same origin and the same page (see docs/WEBMCP.md, verified reads).
5. The MTA live feed changes and an elevator on the accepted route goes out. Both windows
   re-render, the whole tool set re-registers, `toolchange` fires, and `accept_reroute`'s
   description changes from "0 pending proposals" to "1 pending proposal from your companion
   right now (p1)". The companion's agent proposes an alternative; the rider's agent surfaces it;
   the rider confirms it inside `accept_reroute`'s execute.
6. The rider files a broken-equipment report through a declarative HTML form tool. The agent
   fills the fields and stops. A human presses Submit, because the form carries no
   `toolautosubmit`.

Concretely: Court Sq (E M G 7) to Bleecker St (6, with a transfer to B D F M), wheelchair, is the
demo pair. Live as of the 2026-09-03 build: the F direct scores 26 (moderate), G to Church Av then
F scores 35 (moderate), F to 6 Av/14 St then M scores 43 (moderate). EL445X at Court Sq is out on
the 7 platform to mezzanine, which is not on any of these routes, so the trip reads clean while the
station panel still shows a real outage. The demo control simulates EL328 going out at Bleecker
(labelled SIMULATED everywhere it appears): the F flips to 86 (avoid, broken), F then M reaches 100
(broken), and G then F becomes the recommendation at 35.

A second worked example: 34 St-Penn Station (A C E). Two complexes share that name, one on the
A/C/E and one on the 1/2/3/LIRR; the station picker shows both, so pick the A C E one. Times
Sq-42 St to that complex has three one-seat rides, the A, the C and the E, differing on one
elevator at Penn Station: the A lands on EL227, the C and the E both land on EL228. One
`route_accessible` call returns all three routes scored: A at 13 (low risk), C and E at 88 (avoid,
broken), because EL228 is out and non-redundant (see docs/ROUTING.md, section 5). Numbers move
with the live feed; EL228 is due back 2026-09-05.

## Why WebMCP is the right fit here

**Two people, two agents, one origin, one page, different tools.** A rider and the person helping
them are not the same user with the same permissions. WebMCP registers tools per session, from the
page, so the same trip under a second capability key presents a different tool list to a different
agent
without a second deployment, a second server, or an auth handshake. A server-side MCP server
would need a second deployment and an auth handshake to express that: with DOM scraping or a
shared login the page cannot tell which person's agent is asking. The asymmetry is visible in
DevTools > Application > WebMCP before anyone says a word.

**The tool set is state, not configuration.** `toolsForRole` rebuilds every description from the
current trip and the current live feed, so re-registering a generation produces text a model can
act on: "The accepted route r1 is BROKEN right now: EL228 is out of service, so a new route is
needed." When the MTA feed changes, the page re-registers and Chrome fires `toolchange`. The
agent's picture of what it can do updates because the subway changed, not because someone
restarted a process.

**Declarative form tools, deliberately without `toolautosubmit`.** `create_trip` and
`report_broken_equipment` are HTML forms carrying `toolname`, `tooldescription` and
`toolparamdescription`, and neither carries `toolautosubmit`. Without it the browser fills the
fields, focuses the submit button and stops. Filing a maintenance report against real MTA
equipment is a thing an agent should draft and a person should send. `:tool-form-active` outlines
the filled form and captions it.

**Confirm before mutate, inside `execute`.** WebMCP has exactly two annotations, `readOnlyHint`
and `untrustedContentHint`. There is no `destructiveHint` and no shipped
`requestUserInteraction()`, so every mutating tool parks its own promise inside `execute` and
pushes a confirmation card into the page. Reject rejects the call with the rider's own words
("The rider rejected the reroute: that transfer is too long for me") so the agent can offer
something else instead of retrying. Abort closes the card.

**`untrustedContentHint: true` on `get_trip`, and nowhere else.** It is the one tool that returns
free text a different human typed: notes, report descriptions, and the reason on a reroute
proposal. That text is delimited before it reaches the model and the result says in words that it
is data, not instructions.

## The data

Three keyless MTA sources, joined into one committed artifact (docs/DATA.md).

| Source | What it gives | Size |
|---|---|---|
| `data.ny.gov` dataset `rc78-7x78` | monthly availability, outage counts, entrapments per unit | 82,385 rows, 2015-01 to 2026-07 |
| `nyct_ene_equipments.json` (MTA) | equipment master: what each unit connects, ADA flag, redundancy, next ADA station | 704 rows |
| `nyct_ene.json` (MTA) | live outage feed, refreshed continuously | 85 records at build time |

Numbers are the 2026-09-03 build snapshot (data/index-meta.json); live counts move with the MTA
feed, call /api/health for current values.

`data/index.json` is 695 records, one per equipment code, 413 elevators and 282 escalators across
123 accessible station complexes (data/index-meta.json, `GET /api/health`). Each record carries
its metrics over the trailing 24 reported months, its percentile rank inside its own equipment
type, a tier, and a `tier_reason` string that names the thresholds that produced it, for example
`"unreliable: availability_24h_mean_24m 0.9688 <= p25 0.9764; unscheduled_24m 134 >= p75 47.5000;
entrapments_24m 77 > p90 14"`.

**Join coverage** (data/index-meta.json): 77 of 77 distinct live-outage equipment ids resolve to a
record in the index, 100%. 691 of 704 equipment-master ids resolve, 98.2%. The 13 that do not are
units the monthly availability report has no history for.

**Tiers are percentiles of the unit's own population**, elevators and escalators computed
separately, recomputed on every build. Elevator cuts: p25 availability 0.9764, p75 0.9882, p50
unscheduled 30, p75 unscheduled 47.5, p90 entrapments 14. Escalator cuts: p25 availability 0.9531,
p75 0.9771, p50 unscheduled 105.5, p75 unscheduled 180.75, p90 entrapments 0. A unit needs 6
months on record to get a real tier; everything else is `unknown` and stays out of the percentile
population. The resulting split is 83 reliable / 172 watch / 152 unreliable / 6 unknown for
elevators and 66 / 114 / 102 / 0 for escalators (data/index-meta.json).

That is the second version of the tier. The first folded "has any entrapment" into the tier
directly, which put 339 of 413 elevators in one bucket and made every routing decision clamp to
"avoid equally", and an ungated `entrapments >= p90` made 100% of escalators unreliable because
the escalator p90 is 0. Both are written up in docs/DATA.md rather than quietly fixed.

Rebuild with `node scripts/build-index.ts`. No API key. About 10 to 20 seconds, roughly 57 MB of
historical rows across two paged requests.

## Routing

`src/lib/route/` builds a graph from the equipment master alone: 123 nodes (station complexes with
at least one active ADA elevator), 558 ride edges over 23 lines, of which 472 are asserted by the
MTA's own `nextadanorth` / `nextadasouth` fields and 86 are reciprocal mirrors this code adds and
flags `inferred: true`. 840 line-transfer edges inside complexes. 384 ADA elevator rows out of 704
(docs/ROUTING.md, printed by the first test in `npx vitest run src/lib/route`).

Search runs over `(station, line)` states with cost `stops + 4 * transfers`, each state settleable
six times so the three candidates are genuinely different paths rather than near-copies. Risk score
is a sum: 25 for each dependent `unreliable` elevator, 10 for `watch`, 8 for `unknown`, 2 for
`reliable`, at half weight when a second elevator can make the same move; 15 per transfer; plus 60
and `broken = true` if any required non-redundant elevator is out in the live feed. Clamped 0 to
100, labelled low risk / moderate / high / avoid. Ranking uses the pre-clamp score so a future
re-tiering cannot collapse three routes into a tie at 100.

Honest blind spots, all from docs/ROUTING.md section 2:

- **"Manhattan-bound" cannot be resolved from the text.** It means south from the Bronx and north
  from Brooklyn, and the master's `borough` column is empty on all 704 rows. 65 of 264
  platform-touching elevators use that phrasing. A sibling heuristic recovers many; the rest stay
  `unknown` and are reported as `possible`, which over-includes dependencies and inflates risk
  rather than hiding one.
- **`elevatorsgtfsstopid` is a complex-level list**, not per elevator. Every elevator at Times Sq
  carries the same five stop ids, so an elevator can be tied to a line set but not to one platform.
- **`stops` counts accessible stations, not stations.** Journey time is not modelled at all.
- **No timetable.** Weekend service changes, the B not running on weekends, the M short-turning:
  none of it exists here.
- **20 elevators land in segment `other`** ("Bus terminal to subway", "Balcony to Oculus & PATH")
  and are excluded from dependency sets, so a route through Port Authority slightly understates
  what it depends on.
- **46 `nextada*` values could not become an edge**, all logged with a reason: 40 point at
  stations with no active ADA elevator or at MRNs the MTA does not publish at all, 6 are
  self-loops. **4 nodes are unreachable** by ride edge, including New Dorp on the Staten Island
  Railway, which genuinely is a separate system. `findRoutes` returns a note, not an exception.
- **`avoidEscalators` changes nothing and says so** in `result.notes`, because the graph is
  elevators only.

## The tools

Fifteen tools. `readOnlyHint` and `untrustedContentHint` are the only annotations WebMCP has.
Full input schemas in docs/WEBMCP.md.

| Tool | rider | companion | readOnlyHint | What it does |
|---|---|---|---|---|
| `list_accessible_stations` | yes | yes | true | Accessible stations, lines, elevator count, worst tier |
| `station_status` | yes | yes | true | Live outages plus history for one station |
| `elevator_history` | yes | yes | true | One equipment code: 24-month metrics and the query behind them |
| `current_outages` | yes | yes | true | The live feed, filtered by station, line or ADA flag |
| `route_accessible` | yes | yes | true | Up to three scored routes with their elevator dependencies |
| `compare_routes` | yes | yes | true | Side-by-side risk for route ids in this trip |
| `get_trip` | yes | yes | true, plus `untrustedContentHint` | Shared trip state, including human-typed free text |
| `create_trip` | yes, declarative form | no | false | Creates the trip. No `toolautosubmit` |
| `accept_route` | yes | no | false | Picks the initial route. Confirm card |
| `accept_reroute` | yes | no | false | Accepts the companion's proposal. Confirm card |
| `propose_reroute` | no | yes | false | Companion adds a proposal with a reason, max 280 chars |
| `watch_equipment` | yes | yes | false | Subscribes to equipment codes, visible watch list |
| `add_note` | yes | yes | false | One line into the shared trip timeline |
| `report_broken_equipment` | yes, declarative form | no | false | Files a report. No `toolautosubmit` |
| `share_trip` | yes | no | true | Returns the companion URL |

Every read result carries `source` (`{dataset, query, rows}`) and, for live data, `fetchedAt`.
Errors are sentences: "No step-free route found from X to Y under these constraints. Try raising
maxTransfers or turning off avoidEscalators, then call this tool again."

Hiding a tool from a session is not the security boundary. `POST /api/trip/:id/action` re-checks
the role server-side and returns 403 with "Only the rider can accept route. You are the companion:
propose a reroute instead and the rider confirms it."

## How to try it

You need Chrome 149 or later with WebMCP enabled at `chrome://flags/#enable-webmcp-testing`, or
the ChatGPT in-app browser, which speaks WebMCP.

1. Open https://out-of-service-sepia.vercel.app and plan **Court Sq (E M G 7) to Bleecker St (6,
   with a transfer to B D F M)**, wheelchair. That is the demo pair: live as of the 2026-09-03
   build, the F direct scores 26 (moderate), G to Church Av then F scores 35 (moderate), and F to
   6 Av/14 St then M scores 43 (moderate). EL445X is out at Court Sq on the 7 platform to
   mezzanine, which is not on any of these routes, so the trip reads clean while the station panel
   still shows a real outage. Add `?demo=1` (step 5) to simulate EL328 going out at Bleecker,
   labelled SIMULATED throughout: the F flips to 86 (avoid, broken) and G then F becomes the
   recommendation. A second worked example: plan **Times Sq-42 St to 34 St-Penn Station**, picking
   the A C E complex (Penn has two complexes with that name; the picker shows both). The A scores
   13, low risk; the C and the E score 88, avoid, broken, because EL228, the non-redundant
   mezzanine-to-platform elevator at Penn Station on the C/E side, is out (94.1% availability over
   24 months, 35 unscheduled outages, 7 entrapments). Numbers move with the live feed; EL228 is due
   back 2026-09-05.
2. Open DevTools > **Application > WebMCP** in that window. **Available Tools** lists 13. Real
   screenshots of this panel for both windows, including an invoked call, are in
   [`docs/WEBMCP.md#what-a-judge-sees-in-devtools`](docs/WEBMCP.md#what-a-judge-sees-in-devtools).
3. Copy the companion link, open it in a second window, open the same pane. It lists 10. The three
   missing imperative tools are `accept_route`, `accept_reroute` and `share_trip`, plus the
   declarative `report_broken_equipment`, which appears with no `annotations` object because Chrome
   registered it from the form itself.
4. Click any tool in the pane, fill the params form and press **Run tool**. That bypasses the agent
   entirely and proves the tool works. Run `accept_reroute` and the confirmation card appears in
   the page; the call stays pending until a human presses Confirm. **Invoked Tools** shows Status,
   Input and Output for every call, and the page renders the same log for the last 20 calls with
   durations.
5. Add `?demo=1` to the rider URL to force an outage on one elevator of the route if the real feed
   happens to be quiet on camera. Everything it touches is labelled `SIMULATED`, in the chip, in
   the outage row and in every tool result. Unlike the trip's other fields it never reaches the
   MTA feed or the index, but it *is* trip state now: the companion window sees the same forced
   outage within about two seconds, no reload, because it goes over the same SSE stream as
   everything else. Cleared by the panel's "clear" button.

For a live cross-check of any equipment code, the MTA publishes the same feed at
https://new.mta.info/elevator-escalator-status. EL290X at 42 St/Port Authority-Bus Terminal has
been out since 28 October 2024, roughly 675 days, with an estimated return of 31 December 2026.

Calling a tool from a console instead of the panel: in Chrome 149 to 152 builds,
`document.modelContext.executeTool(name, args)` expects `args` as a JSON string
(`JSON.stringify(input)`), not a plain object, despite the spec IDL saying `object`
(webmachinelearning/webmcp issue #278). Passing an object throws. Our tool log and evals use the
string form.

## Which layer runs

`document.modelContext` only. Never `navigator.modelContext`: the getter moved from Navigator to
Document in the 27 May 2026 draft (webmcp#184), and MCP-B's polyfill keeps the old name only as a
deprecated alias.

`src/lib/webmcp/runtime.ts` reads `document.modelContext` once, before anything else touches it,
and caches the answer. Present at load, the layer is `native` and nothing is installed. Absent,
`@mcp-b/webmcp-polyfill` is imported dynamically and installs a real `ModelContext`, and the layer
is `polyfill`. If the polyfill refuses to install (no secure context, cross-origin frame), the
layer is `unavailable` and the panel says so instead of pretending. The badge in the tool panel
prints that word and `data-webmcp-layer` carries it for scripted checks.

`registerTool` is called directly rather than through the `usewebmcp` hook, for two reasons
checked against the shipped `.d.ts`: the hook types `execute` as `(input) => MaybePromise<Output>`
and never passes the spec's `{ signal }`, which this app needs because a mutation parks inside a
confirmation card; and the hook registers one tool per call, whereas this app re-registers the
whole set as a unit so `toolchange` fires once with a coherent list rather than thirteen times.

**WebMCP is not JSON-RPC MCP.** Nothing here speaks the MCP wire protocol, there is no MCP server
and no stdio or HTTP transport. WebMCP is a browser API in which a page registers tools on
`document.modelContext` for whatever agent is in that tab. It shares MCP's tool contract shape
(name, description, JSON Schema input, structured result) which is why an MCP-shaped client
understands the tools, but the transport is the browser, not a server connection.

## Evals

`evals/` follows Chrome's evals guidance: 17 fixtures in the `{messages, expectedCall}` shape, plus
`role`, `page` and `state`, because the tool list under test is `toolsForRole(role, trip)` and not
one global list.

```bash
npx vitest run evals
```

The deterministic half asserts, for every fixture, that each `functionName` is a tool this app
registers, that it is registered for that fixture's role, and that the `arguments` object validates
against that tool's real `inputSchema` under a draft-2020-12 validator. Fixture 11 is the negative
case: a companion asking to accept, where the correct behaviour is no tool call at all and
`expectedUnavailable: ["accept_reroute", "accept_route"]` is asserted against `isAllowed`.

## Tests

```bash
npx vitest run
```

118 tests across 5 files pass on this build. The WebMCP lifecycle tests run against
`@mcp-b/webmcp-polyfill` as a real `ModelContext` rather than a hand-rolled mock, inside a minimal
DOM shim, and cover role-gated registration for both roles, annotations as the browser reports
them, abort removing every tool, re-registration without duplicates, `toolchange` firing with a
changed `accept_reroute` description, the confirm gate rejecting with the rider's own words,
provenance surviving to the model, and free text coming back delimited.

Per verification policy, the live-feed cache-staleness and equipment-code-normalisation assertions
were manually broken, confirmed red, and restored (docs/LIVE.md).

## Local dev

```bash
pnpm install
pnpm approve-builds --all   # once per machine, esbuild's postinstall
pnpm dev                    # http://localhost:3000
```

`GET /api/health` reports the index counts, the routing graph stats, live join coverage and which
store backend is active. Production runs Vercel Blob; with no store env vars set, the store falls
back to an in-memory map with a loud warning, which is fine for local dev and useless across two
browser windows on different machines.

## Known limitations

- **The Chrome Origin Trial token is not in the page yet.** Registration requires a signed-in
  Google session on the origin trials site and that flow was not completed (docs/ORIGIN-TRIAL.md
  has the exact blocker and the four steps left). Until it is, the deployed site needs
  `chrome://flags/#enable-webmcp-testing` or a browser that ships WebMCP on, and the polyfill
  covers everything else.
- **The confirmation card is not a capability boundary.** webmcp#288 shows an agent that also
  automates the raw page can click Confirm itself. The card raises the cost and creates a record.
  The capability key described below is the part that actually holds, and the drafted
  `requestUserInteraction()` has not shipped.
- **Role used to be a self-declared string; it is now a capability carried by the link.** Two
  judges (Andrew Galloni, Cloudflare; Jude Gao, Vercel) proved with cold `curl`, no cookie, no
  session, that `POST /api/trip/:id/action {"role":"rider"}` executed rider-only actions against a
  trip they had never touched: the server checked *that* a role was present, not *who* was
  claiming it. Fixed: `createTrip` mints two unguessable tokens (`trip.riderKey`,
  `trip.companionKey`), the rider URL is `/t/<id>?k=<riderKey>`, the companion URL is
  `/t/<id>?k=<companionKey>`, and the action route derives role from whichever key is presented,
  ignoring any `role` field in the body. Both keys are stripped from `GET /api/trip/:id`, the SSE
  stream, and every WebMCP tool result; a wrong or missing key renders "This link is not valid"
  with no trip data. See docs/WEBMCP.md, Security.
- **`POST /api/trip` stays unauthenticated by design, not by oversight.** Creation is cheap: it
  runs a route search and writes one trip object, no different in cost from any other write on
  this service. It mints the two capability keys described above but holds no data anyone has
  a stake in protecting until one of those keys is actually used, there is no rider or companion
  to authenticate against before the first key exists, so a role check on this endpoint would have
  nothing to check a caller's identity against. The abuse this endpoint needs to resist is
  volume, not impersonation, and that is what the per-IP rate limit already bounds (60 creations
  per minute per address, `src/app/api/trip/route.ts`); a role or auth requirement here would add
  friction to the one legitimate caller (a fresh visitor with no key yet) without shrinking the
  set of things an attacker could reach. See docs/WEBMCP.md, Security, for the same reasoning
  next to `roleForKey()`.
- **The trip-scoped action rate limit is tiered by write cost, not flat.** `accept_route`,
  `accept_reroute`, `propose_reroute` and `simulate` all write the trip's optimistic-concurrency
  version and can force a losing writer's retry in `applyAction`; they share a tighter 12/minute
  ceiling per trip. `watch`, `note` and `report` append without contending on that version field
  and share a separate 60/minute ceiling. Each tier has its own counter
  (`trip:<id>:action:contended` / `trip:<id>:action:cheap`) so a burst of one never starves the
  other's budget, and the 429 body names which tier tripped so an agent retrying after a 409 (a
  losing write, try again) can tell it apart from a 429 on the same action (back off, this trip's
  write path is hot). The per-IP ceiling (`src/lib/store/ratelimit.ts`) is unchanged and still
  applies on top, regardless of action type.
- **Blob store eventual consistency.** Every trip version is a separate immutable object at
  `trips/<id>/<version>.json`; reads `list()` the prefix, which is an immediately consistent API
  call, and fetch the highest version's URL, so the 60-second CDN cache on a blob URL can never
  serve a stale trip. A write whose version is not exactly `stored + 1` fails with a
  `StaleWriteError` and `applyAction` re-reads and retries up to four times, so two agents acting
  at once both land.
- **Direction inference has real gaps**, listed under Routing above. The failure mode is
  over-inclusion of elevator dependencies, which inflates a route's risk score rather than hiding
  a dependency.
- **NYCT subway only.** No PATH, no Long Island Rail Road, no Metro-North, no buses, and Staten
  Island Railway appears in the data but is disconnected from the graph.
- **Chrome before 153 cancels an in-flight tool call when its `AbortController` is aborted.** A
  mutation bumps the trip version, which re-registers the set, which used to abort the call that
  caused it. The registration effect now waits for zero in-flight calls (5 second cap) before
  aborting, and serializes generations. Chrome 153 decouples the two natively.
- The live feed's timestamps are wall-clock America/New_York with no offset, resolved against the
  platform's ICU timezone database. Correct for every instant except the ambiguous hour on the two
  DST transition days a year.

## Licence

MIT. See LICENSE.

# Judging: Out of Service — Alex Nahas, creator of MCP-B

Lens: I built MCP-B because agents were faking clicks and calling it AI. The question I ask first
is not "does it work" but "is this a tool contract or is it DOM actuation wearing a WebMCP
costume," and which layer of the stack it's actually running on — native `document.modelContext`,
a polyfill, or a full MCP bridge. I open DevTools > Application > WebMCP before I read a word of
the pitch. `qa` browser profile, live production URL, native support confirmed before touching
anything else.

## 1. What I did

**Layer check, first, before reading any copy.**
```
document.modelContext.constructor.name -> "ModelContext"
document.querySelector('[data-webmcp-layer]').getAttribute('data-webmcp-layer') -> "native"
```
This is genuinely `document.modelContext`, not `navigator.modelContext` (the pre-May-2026 name I
get asked about constantly), and it's native in this Chrome build, not the polyfill silently
patching it in. The badge printing `native`/`polyfill`/`unavailable` and `runtime.ts` reading
`document.modelContext` once before anything else touches it is exactly the right way to avoid the
classic bug where you install the polyfill first and then every browser reports "native" because
you clobbered the check.

**Home page, `create_trip`.**
```
getTools() -> [["create_trip", null]]
```
One tool, declarative:
```html
<form toolname="create_trip" tooldescription="Start a shared accessible trip between two NYC
subway stations with the rider's constraints. Returns the trip id and a companion link. The rider
reviews the filled fields and presses Create; this form is never submitted automatically.">
  <input required toolparamdescription="Origin station name or complex id..." name="from">
  <input type="checkbox" toolparamdescription="Check when the rider needs a fully step-free
    path, elevators only." name="wheelchair" checked>
  <input type="number" min="0" max="4" toolparamdescription="..." name="maxTransfers" value="2">
```
No `toolautosubmit`. Real `toolname`/`tooldescription`/`toolparamdescription` attributes, correctly
unprefixed, matching the current declarative-api-explainer naming rather than an old `data-tool-*`
convention some 2024 blog posts still show.

**Rider trip page (demo trip, Court Sq → Bleecker St, `?demo=1`), the imperative side.**
`getTools()` returned 12 tools with real descriptions and correct annotations — `readOnlyHint:
true` on every pure read (`compare_routes`, `elevator_history`, `route_accessible`,
`list_accessible_stations`, `current_outages`, `station_status`, `share_trip`), `false` on every
mutation (`accept_route`, `accept_reroute`, `add_note`, `watch_equipment`), and
`untrustedContentHint: true` on exactly one tool, `get_trip` — the only one that hands back free
text someone else typed. That is the correct, minimal use of WebMCP's actual two-annotation
surface; there's no invented `destructiveHint` anywhere, which would have been a tell that the team
didn't read the IDL.

**A real `executeTool()` call, native API, not the DOM.**
```js
document.modelContext.executeTool(elevator_history_tool, {equipment:'EL328'})
// -> UnknownError: Failed to parse input arguments
document.modelContext.executeTool(elevator_history_tool, JSON.stringify({equipment:'EL328'}))
// -> '{"code":"EL328","station":"Bleecker St","tier":"unreliable","availability24m":0.9546,
//     "unscheduled24m":186,"entrapments24m":12,"currentlyOut":false,
//     "source":{"dataset":"rc78-7x78","query":"https://data.ny.gov/resource/rc78-7x78.json?...
//     equipment_code='EL328'...","rows":139},"fetchedAt":"2026-09-03T14:07:04.774Z"}'
```
I hit the exact spec-vs-Chrome-implementation gap I know about from issue #278 first-hand — the
IDL types `executeTool`'s second argument as `optional object`, but this Chrome build wants a JSON
string. `docs/WEBMCP.md` documents this with a date and a fix note ("Dated finding on webmcp#278"),
which tells me they hit this themselves rather than copying a code sample that happened to work.
`route_accessible` the same way returned real routes with per-elevator `source.query` (the live
`data.ny.gov` URL) and `fetchedAt` — this is a tool contract returning structured data an agent can
reason over, not a scraped DOM fragment.

**Role asymmetry, live, same origin.** Companion tab (`?k=<companionKey>`):
`getTools()` -> `add_note, compare_routes, current_outages, elevator_history, get_trip,
list_accessible_stations, propose_reroute, route_accessible, station_status, watch_equipment` — 10
tools. No `accept_route`, `accept_reroute`, `share_trip`, `report_broken_equipment`. Same origin,
same deployed page, a different `RegisteredTool` set per session because the tool set is a
function of role and trip state, not a static manifest.

**The full write path, native API where possible, human gate exercised for real.** I simulated an
EL328 outage on the rider tab (demo control), watched both windows re-render with no reload
(SSE-driven `toolchange`), then called `propose_reroute` via `executeTool()` on the companion tab.
The call **did not return** — it was parked behind `await ctx.confirm(...)`, and the page showed
"AGENT WANTS TO ACT / Send this reroute to the rider? / Confirm / Reject". I clicked Confirm in
the DOM (the human's job, correctly) and the promise resolved: `{"proposalId":"p_pltjbfqg",
"status":"pending",...}`. On the rider tab, `accept_reroute`'s description had already changed to
name that exact proposal id before I called it — `toolchange` had fired and the tool's own
description is derived from live state, not a static string. I called `accept_reroute` via
`executeTool()`, it parked behind its own confirm card ("Accept your companion's reroute? Switch
to G / F"), I confirmed, and the accepted route flipped on both windows. This is the AbortSignal-
aware, generation-serialized lifecycle I'd want to see: `WebMCPTools.tsx` keeps a
`generationChain` promise, waits for `whenToolsIdle()` before aborting the previous generation's
`AbortController`, specifically to avoid the pre-Chrome-153 bug where aborting `registerTool`'s
signal also cancels an in-flight `executeTool()` call. `docs/WEBMCP.md` names this bug and the fix
with a date. That's someone who read the lifecycle section of the spec, not someone who read the
`registerTool()` signature and stopped.

**Layer choice, explicitly justified against the shipped `.d.ts`, not vibes.** `docs/WEBMCP.md`
gives two concrete, checked reasons for calling `registerTool` directly instead of my own
`usewebmcp` package: it types `execute` as `(input) => MaybePromise<Output>` with no `{ signal }`,
which this app needs because a mutation parks inside a confirm card and must be cancellable; and it
registers one tool per hook call, where this app wants one `toolchange` event per generation, not
thirteen. Both are real, checked distinctions between "native spec surface," "my polyfill/hook,"
and "what this app actually needs" — exactly the layering question I care about most.

**Errors, self-inflicted, disclosed.** Two of my own malformed test calls (passing an object where
Chrome wants a JSON string, before I'd re-read the spec note above) threw uncaught `TypeError`s in
page console — 4 exceptions total across the session, all traceable to my own bad `executeTool`
calls, not application code. `bhn qa observe` on both tabs at rest, after the full flow, showed 0
events/0 exceptions on a clean poll. Blind spot: I did not independently reproduce the DevTools
Application > WebMCP panel screenshot itself in this pass (headless CDP via `bhn`, not a windowed
DevTools session) — I verified the exact same facts (tool count, names, annotations, invocation)
through the native `document.modelContext` API directly, which is the same data the panel reads.

**WebMCP vs MCP, stated correctly.** `README.md`: "WebMCP is not JSON-RPC MCP. Nothing here speaks
the MCP wire protocol, there is no MCP server and no stdio or HTTP transport... It shares MCP's
tool contract shape... which is why an MCP-shaped client understands the tools, but the transport
is the browser, not a server connection." That is the correction I've had to make in public before
— WebMCP shares an API surface with MCP's TS SDK, it does not implement the JSON-RPC MCP spec —
stated precisely, unprompted, in the README rather than left implicit.

## 2. Scores

**WebMCP Leverage: 5/5.** Fifteen tools, role-scoped registration that changes the actual
`RegisteredTool` set per session (not a client-side filter over one static list), descriptions that
are recomputed state rather than decoration, a real confirm-gate built inside `execute` because the
spec genuinely has no `destructiveHint`, and a generation-serialized `AbortController` lifecycle
that specifically works around a dated Chrome bug. This is not a demo that registered three tools
to check a box — it's someone who read `index.bs`.

**Execution: 4/5.** I ran the entire loop myself through the native API end to end: outage
simulated, `toolchange` fired, companion proposed through a blocking confirm, rider accepted
through a second blocking confirm, both windows updated with no reload. It all worked on the first
real attempt once I used the right argument shape. Down one point because the Origin Trial token
isn't in the page yet (documented honestly as a known limitation, not hidden), so the real native
path still needs a flag or the ChatGPT browser rather than being live for every visitor by default.

**Potential Impact: 4/5.** The role-asymmetry mechanic (rider vs. companion, different capability,
different tool list, same page) is a real answer to a problem a server-side MCP tool genuinely
cannot express, and the routing use case is concrete and sourced (real MTA data, real equipment
codes, a `source.query` on every number). Not a 5 because the impact case rests on one demo trip
and a well-argued mechanism, not a usage number — no session count, no rider testimonial, nothing
beyond "here is what the mechanism does when I run it," which is the honest state of a hackathon
build but still a point short of proven impact.

**Creativity & Ambition: 4/5.** Two roles negotiating over the same trip through two independently
scoped tool sets on one origin, with a live server-truth re-tiering of the route mid-session, is a
shape I haven't seen another WebMCP entrant attempt. It loses a point only because the underlying
domain move — score a route by the reliability history of its physical dependencies — is a
sensible but not conceptually novel idea; the ambition is concentrated entirely in the two-agent
WebMCP mechanics, which is where it should be for this hackathon, but it means the "creativity" is
narrower than the "leverage."

**Total: 17/20**

## 3. The one thing that would move my score up a point

Ship the Origin Trial token (`docs/ORIGIN-TRIAL.md` names the exact four steps left) so the native
path is live for anyone who opens the URL in stock Chrome 149+, not just a flagged build or the
ChatGPT browser. Everything else here is already correct; this is the one gap between "I can prove
this is native" (which I did, myself, in this pass) and "any judge opening the link in a normal
browser sees the same thing without a flag."

## 4. What would make me distrust this

If the confirmation card I clicked through had been decorative — if `executeTool()` had actually
resolved before I pressed Confirm, or if the mutation had already landed server-side while the
card sat there for show — that would be the exact "actuation wearing a WebMCP costume" pattern I
built MCP-B to replace. It wasn't: the promise genuinely didn't resolve until I clicked, twice,
independently, for two different tools. The one honest crack in the story, and it's disclosed
rather than hidden: `docs/README.md`/`WEBMCP.md` both cite webmcp#288 and say outright that this
confirm card is "a record and a cost, not a capability boundary" — an agent automating the raw page
alongside WebMCP could still click Confirm itself. They name the real boundary as the server-side
capability key instead of overclaiming the card. That kind of unprompted honesty about a known spec
gap is the opposite of what would make me distrust a submission.

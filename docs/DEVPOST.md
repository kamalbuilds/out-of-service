# Devpost submission text

Paste-ready. Field names match the Devpost submission form for The WebMCP Challenge.

---

## Project name

Out of Service

## Tagline (under 100 characters)

Two people, two agents, one page. The companion's agent cannot accept the reroute. Step-free NYC.

## Links

- Live: https://out-of-service-sepia.vercel.app
- Repo: https://github.com/kamalbuilds/out-of-service (MIT)

---

## The problem

A wheelchair user is at Court Sq trying to reach Bleecker St. New York's subway has
[160 accessible stations](https://www.mta.info/article/accessibility-disability-pride-month-2026)
out of
[472](https://gothamist.com/news/mta-settles-suit-to-make-subway-elevators-more-reliable), and
almost every one depends on an elevator. Advocates counted at least 25 elevator outages a day,
median about four hours
([Gothamist](https://gothamist.com/news/mta-settles-suit-to-make-subway-elevators-more-reliable)).
If the one you need is out, you find out standing in front of it.

The person tracking that trip, a partner, an aide, an adult child, is somewhere else with a phone.
They can read the same feed the rider can, and do nothing with it but text.

Planning around it barely works. The MTA status page says what is broken this minute, never what
breaks often.

In July 2026 a class action about exactly this settled. *CIDNY v. MTA* now requires advance notice
of elevator outages, platform announcements every 15 minutes, and real-time alternate accessible
routes
([Disability Rights Advocates](https://dralegal.org/press/ny-subway-elevators-settlement/)). The
obligation exists now. The thing a rider holds does not.

## What Out of Service is

Out of Service scores every step-free route between two accessible stations on the specific
elevators it depends on, using eleven years of MTA outage history joined to the live feed, so a
route arrives as a number and a named list of equipment instead of a hope. The rider and the
companion open the same trip on the same page, each with their own agent, and the two agents get
different tools.

## How it works

Three keyless MTA sources, joined into one committed artifact (`docs/DATA.md`): 82,385 monthly
availability rows over 695 equipment codes, 2015-01 to 2026-07, from NY State dataset `rc78-7x78`; the 704-row
equipment master, which names what each unit connects; and the live outage feed, 85 records at
build time.

The join is `data/index.json`: 695 records, 413 elevators and 282 escalators across 123 accessible
complexes, each with 24 months of metrics, a percentile rank inside its own equipment type, a tier, and a `tier_reason` naming the thresholds behind it (`unreliable:
availability_24h_mean_24m 0.9688 <= p25 0.9764`). All 77 live-outage ids join into the index
(`data/index-meta.json`). Routing runs on a graph from the master alone: 123 nodes, 558 ride edges over 23 lines, 472
asserted by the MTA's own next-accessible-station fields (`docs/ROUTING.md`).

The score is a sum, not a verdict: 25 per dependent unreliable elevator, 10 watch, 8 unknown, 2
reliable, halved where a second elevator makes the same move, 15 per transfer, plus 60 and a `broken` flag if a required non-redundant elevator is out live. Broken is never
"this station has an outage", always "this route needs this elevator, nothing else makes that
move, and it is out". Every number on screen is dotted, and clicking it opens the dataset, the
query and the row count.

## Two people, two agents, one page

Creating a trip mints two unguessable keys. The rider gets `/t/<id>?k=<riderKey>`; the companion
link is the same trip with the other key. Tools register per session from those keys, so DevTools >
Application > WebMCP lists 13 tools in the rider's window and 10 in the companion's, same origin,
same page, before either agent says a word.

Hiding a tool is not the boundary. `POST /api/trip/:id/action` derives the role from the key
and ignores any role in the body, so a forged accept from the companion's session comes
back 403: "Only the rider can accept route. You are the
companion: propose a reroute instead and the rider confirms it."

Every write parks inside `execute` behind a confirmation card and does not resolve until a person
presses Confirm. Reject rejects it in the rider's own typed words, so the agent hears "that
transfer is too long for me" and offers something else. The broken-equipment report is a
declarative HTML form with no `toolautosubmit`: the agent fills it in and stops, a person sends it.

When the feed changes, the whole set re-registers and `toolchange` fires, and `accept_reroute`'s
description goes from "0 pending proposals" to "1 pending proposal from your companion right now
(p1)".

## Features

- **Route scoring with tiers.** Three routes, each with a risk number, a label and the elevators
  behind it.
- **Live station panel.** Outages at both ends with the MTA's return estimates.
- **Companion link.** Its own capability key, its own tool set.
- **Proposals and acceptance.** The companion proposes with a reason, the rider accepts or rejects,
  both windows updating in about two seconds.
- **Watch equipment.** Subscribe to codes, see them in a watch list.
- **Broken-equipment report.** A declarative form the agent fills and a person sends.
- **Source on hover.** Every dotted number opens its dataset, query and row count.
- **Simulated outage.** Forces one elevator out for the session, labelled SIMULATED throughout.
- **Origin trial.** The Chrome WebMCP token is in the page head, so stock Chrome needs no flag.

## Why WebMCP is the right fit

**Why this use case is a strong fit for WebMCP.** Two humans with different authority share one
page. WebMCP registers tools per session from inside the page, so one origin and one path present
13 tools to the rider's agent and 10 to the companion's, decided by the key in the link. A server-side MCP server can express two roles, but not without a second deployment, an auth
handshake and an account for the companion.

**How it creates a better experience.** Before: four equipment-code lookups across two MTA pages,
two minutes of cross-referencing, an answer good only for this minute. After: one
`route_accessible` call, under a second, three routes scored on their elevators' 24-month history. Court Sq (E M G 7) to Bleecker St returns the F at 26, G then F at 35,
F then M at 43 on the 2026-09-03 build. Take EL328 at Bleecker out and the F flips to 86,
avoid, broken, and G then F becomes the recommendation.

**What people and agents can now do together that was difficult or impossible before.** Two agents split one trip: the companion's watches the feed and proposes, the rider's surfaces it,
a person confirms. The rider never has to trust the companion's agent, or ours, because the
difference is enforced by the server and visible in DevTools.

**How we implemented WebMCP.** `document.modelContext.registerTool` only, never
`navigator.modelContext`, which moved to Document in the 27 May 2026 draft. Fifteen tools,
registered per session by role, each with a strict `inputSchema` and `readOnlyHint`, and
`untrustedContentHint` on `get_trip` alone, the one tool returning text another human typed.
Mutations build their own confirm gate inside `execute`, because WebMCP has no destructive-action
annotation and `requestUserInteraction()` has not shipped; `create_trip` and
`report_broken_equipment` are declarative forms without `toolautosubmit`. `evals/` follows
Chrome's guidance with 17 fixtures carrying `role`, `page` and `state`, one of them a companion
asking to accept, where the right answer is no tool call. The runtime reads
`document.modelContext` once before anything touches it and otherwise loads `@mcp-b/webmcp-
polyfill`, with a badge on the page printing `native`, `polyfill` or `unavailable`.

## What is real today, and what is next

NYCT subway only: no PATH, no commuter rail, no buses. Tiers are percentiles of the equipment's own population, so
"unreliable" means unreliable for New York, not against an absolute standard.
Direction is the honest blind spot: 65 of 264 platform-touching elevators call themselves
"Manhattan-bound", meaning south from the Bronx and north from Brooklyn, and the master's borough
column is empty on all 704 rows. Those are reported as possible dependencies, inflating a route's risk rather than hiding one.

Next: MTA alert subscriptions per watched elevator, so a watch list pushes instead of polls; more
cities, because the same open-data shape exists elsewhere; and the two-agent pattern outside
transit, a pharmacist and a caregiver on one prescription page, where one proposes a substitution
and only the other can accept it.

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS 4, WebMCP (`document.modelContext`),
`@mcp-b/webmcp-polyfill`, Server-Sent Events, Vercel, Vercel Blob, Vitest, Node.js. Data, all
keyless:
[monthly availability](https://data.ny.gov/resource/rc78-7x78.json) (NY State `rc78-7x78`),
[MTA equipment master](https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json),
[MTA live outage feed](https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json).
Counts above are the 2026-09-03 build snapshot; `GET /api/health` returns current live values.
Impact figures:
[MTA](https://www.mta.info/article/accessibility-disability-pride-month-2026),
[Gothamist](https://gothamist.com/news/mta-settles-suit-to-make-subway-elevators-more-reliable),
[Disability Rights Advocates](https://dralegal.org/press/ny-subway-elevators-settlement/). Licence:
MIT.

---

## What is new since 25 August 2026

Everything. The repository was created on 3 September 2026 and every line of this project,
including the derived reliability index, the routing graph and the WebMCP tool layer, was written
after that date. No prior codebase was reused.

## Testing instructions (submission field)

No login, no API key, no setup. Chrome 149 or later with WebMCP turned on at
`chrome://flags/#enable-webmcp-testing`, or the ChatGPT in-app browser. Open
https://out-of-service-sepia.vercel.app.

1. **Plan the demo pair.** Type "Court Sq" and pick the E M G 7 complex as the origin, type
   "Bleecker" and pick the 6 station (with a transfer to B D F M) as the destination, tick
   wheelchair, and plan the trip. Live as of the 2026-09-03 build: the F direct scores 26
   (moderate), G to Church Av then F scores 35 (moderate), and F to 6 Av/14 St then M scores 43
   (moderate). EL445X is out at Court Sq on the 7 platform to mezzanine, which is not on any of
   these routes, so the trip reads clean while the station panel still shows a real outage. Add
   `?demo=1` (step 5) to simulate EL328 going out at Bleecker, labelled SIMULATED throughout: the F
   flips to 86 (avoid, broken) and G then F becomes the recommendation. A second worked example:
   type "Times Sq" and "34 St-Penn Station", picking the A C E complex (Penn has two complexes
   with that name; the picker shows both). The A scores 13, low risk; the C and the E score 88,
   avoid, broken, because EL228 at Penn Station is out and non-redundant. Numbers move with the
   live feed; EL228 is due back 2026-09-05. Click any dotted number to open the dataset, the exact
   query and the row count behind it.
2. **Open the WebMCP pane.** DevTools > Application > WebMCP in that window. Available Tools lists
   13. Click a tool, fill the params form and press Run tool. That runs the tool with no agent
   involved. Invoked Tools shows Status, Input and Output for the call, and the page renders the
   same log with durations.
3. **Open the companion link.** Copy the companion link from the rider's left column and open it in
   a second window (it is the same URL with `?role=companion`). Its WebMCP pane lists 10 tools.
   `accept_route`, `accept_reroute`, `share_trip` and the declarative `report_broken_equipment` are
   absent, and `propose_reroute` is present. Same origin, same page, different tools.
4. **Run the reroute loop.** In the companion window, type a reason on the A route and press
   propose. The rider window shows "1 pending proposal" within about two seconds with no reload,
   and `accept_reroute`'s description in the rider's WebMCP pane changes to name the proposal id.
   Accept it in the rider window, or run `accept_reroute` from the DevTools pane: either way a
   confirmation card appears in the page and the call stays pending until a human presses Confirm.
   Press Reject instead and type a reason to see the rejection come back as a sentence.
5. **Force an outage if the live feed is quiet.** Add `?demo=1` to either window for a demo
   control that marks one elevator on the route as out, in that browser session only. Everything
   it touches is labelled SIMULATED: the chip, the outage row, and the text of every tool result
   that returns it. It is never written to the trip and never sent to the store, and a reload
   clears it. The real MTA feed is the default.
6. **Cross-check the data.** `GET https://out-of-service-sepia.vercel.app/api/health` reports the
   index row count, the routing graph stats, live join coverage and the store backend. Any
   equipment code can be checked against the MTA's own page at
   https://new.mta.info/elevator-escalator-status.

---

## Video script (2:39, first tool call visible around 1:15)

The video walks the Court Sq to Bleecker pair, so you can see the simulated-outage flip on camera.
Both pairs run the same tools.

1. **0:00** Problem: a rider stranded on a platform, MTA's 160-of-472 accessible-station stat, the
   CIDNY settlement.
2. **0:38** Solution: Out of Service scores every accessible route by real elevator failure history
   and gives the rider and companion their own agent on the same page.
3. **0:52** How it works, over diagrams: the three data sources, the reliability score, the route
   graph, the per-role tool registration.
4. **1:15** Rider window, DevTools Application > WebMCP pane open on the right. Voice: "get me
   from Court Square to Bleecker Street in a wheelchair." `route_accessible` appears in Invoked
   Tools.
5. **1:25** Three routes come back clean: F direct at 26. EL445X is out at Court Sq, but on the 7
   platform, route-aware not station-aware, so it does not touch this trip.
6. **1:38** The rider takes the F with `accept_route`. The confirm card appears; a human clicks
   Confirm, not the agent.
7. **1:44** Companion's window, same trip: it has `propose_reroute`, no `accept_reroute`. Cut to
   the rider pane: the reverse.
8. **1:51** Simulated on camera, labelled SIMULATED: EL328 at Bleecker goes out. The F flips to
   86, broken; tools re-register; `accept_reroute`'s description now says "1 pending proposal".
9. **2:04** The companion's agent proposes G then F, at 35.
10. **2:09** The rider's agent picks it up, calls `accept_reroute`, a human hits Confirm, both
    windows update.
11. **2:15** The rider opens `report_broken_equipment`. The agent fills it in; a human presses
    Submit, because there is no `toolautosubmit`.
12. **2:22** Why WebMCP: you can't do this with a chatbot wrapper or by scraping the site, because
    nothing knows which tab is asking. Every number links back to the query behind it.
13. **2:41** Close on the settlement sentence: this is what the MTA's own advance-notice and
    rerouting obligation looks like when the rider's agent does it, and what we keep after today is
    the index.

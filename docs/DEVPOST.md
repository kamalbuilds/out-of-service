# Devpost submission text

Paste-ready. Field names match the Devpost submission form for The WebMCP Challenge.

---

## Project name

Out of Service

## Tagline (under 100 characters)

Two people, two agents, one page: only the rider can accept the reroute. Step-free NYC routing.

(97 characters)

## Links

- Live: https://out-of-service-sepia.vercel.app
- Repo: https://github.com/kamalbuilds/out-of-service (MIT)

---

## Why this use case is a strong fit for WebMCP

Two humans and two agents share one page: a rider in a wheelchair and the companion tracking their
trip each get a different tool list, registered per session from inside the page and enforced
server-side by the trip's capability key, visible in DevTools > Application > WebMCP before either
agent says a word. The rider can accept a route or a reroute; the companion can only propose one,
and a forged accept call presented with the companion's key still gets rejected. The CIDNY v. MTA
settlement, reached July 29, 2026, requires the MTA to give advance elevator-outage notice,
platform announcements and real-time rerouting information
(https://dralegal.org/press/ny-subway-elevators-settlement/). Today, checking three routes by hand
means four equipment-code lookups across two MTA pages and roughly two minutes of manual
cross-referencing; here, one `route_accessible` call returns the same three routes scored, in
under a second. DevTools > Application > WebMCP shows 13 tools in the rider's window and 10 in the
companion's; a server-side MCP server would need a second deployment and an auth handshake to
express that, because with DOM scraping or a shared login the page cannot tell which person's
agent is asking. The tools also change with the world: when the MTA feed says an elevator went
out, the page re-registers and `toolchange` fires, so the agent's picture of what it can do
updates because the subway changed.

## How it creates a better user experience

Court Sq (E M G 7) to Bleecker St (6, with a transfer to B D F M) has one clean one-seat ride
today, the F, at 26 (moderate). Deciding whether that holds means opening the MTA status page,
checking whatever equipment code touches your route by hand, and learning only whether it is out
right now, nothing about how often it fails before. Before: an equipment-code lookup across two
MTA pages and roughly two minutes of manual cross-referencing, then a guess. After: one
`route_accessible` call that returns three scored routes with every dependent elevator's history
attached: F direct at 26, G then F at 35, F then M at 43, all live as of the 2026-09-03 build. When
the demo control simulates EL328 going out at Bleecker, the F flips to 86 (avoid, broken) and G
then F becomes the recommendation at 35, and every number still carries the query that produced
it, so the rider can check the claim rather than trust it. The same call resolves 34 St-Penn
Station's two complexes correctly too: Times Sq-42 St to the A C E one returns the A at 13 (low
risk), the C and the E at 88 (avoid, broken), because EL228 is out and non-redundant.

## What people and agents can now do together that was difficult before

Two agents work the same trip with a real division of labour. The companion's agent watches
the live feed and calls `propose_reroute` with a reason; the rider's agent surfaces it and calls
`accept_reroute`, which parks inside a confirmation card until the rider presses Confirm, or
Reject with a typed reason that reaches the model as a sentence: "The rider rejected the reroute:
that transfer is too long for me." The companion's agent cannot accept anything, even by forging
the call, because the server re-checks the role. DOM scraping gets you one tool surface and a
shared login gets you one identity; neither gives the companion's agent a different set of tools
on the same page.

MTA reports 160 accessible stations of 472
(https://www.mta.info/article/accessibility-disability-pride-month-2026,
https://gothamist.com/news/mta-settles-suit-to-make-subway-elevators-more-reliable). The CIDNY v.
MTA settlement, reached July 29, 2026, requires advance elevator-outage notice, platform
announcements every 15 minutes and real-time rerouting information
(https://dralegal.org/press/ny-subway-elevators-settlement/); advocates count at least 25 elevator
outages a day with a median of about four hours (Gothamist, same URL).

## How WebMCP was implemented

`document.modelContext.registerTool` only, never `navigator.modelContext`, which moved to Document
in the 27 May 2026 draft. The runtime reads `document.modelContext` once before anything touches
it, then falls back to `@mcp-b/webmcp-polyfill`, and an on-page badge prints `native`, `polyfill`
or `unavailable`. Fifteen tools, each with a strict `inputSchema` and `readOnlyHint`;
`untrustedContentHint` on `get_trip` alone, the one tool returning text another human typed, which
is delimited before the model sees it. Every mutating tool builds its own confirm gate inside
`execute`, because WebMCP has no destructive-action annotation and `requestUserInteraction()` has
not shipped. `create_trip` and `report_broken_equipment` are declarative forms with no
`toolautosubmit`, so a person presses Submit. The Chrome origin trial token is not registered on
this origin yet, so stock Chrome 149+ needs `chrome://flags/#enable-webmcp-testing`, or the
ChatGPT in-app browser, to get the native path; `@mcp-b/webmcp-polyfill` covers every other browser
and the badge on the page says which one you are on.

---

## What is new since 25 August 2026

Everything. The repository was created on 3 September 2026 and every line of this project,
including the derived reliability index, the routing graph and the WebMCP tool layer, was written
after that date. No prior codebase was reused.

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS 4, WebMCP (`document.modelContext`),
`@mcp-b/webmcp-polyfill`, `@mcp-b/webmcp-types`, `usewebmcp`, Server-Sent Events, Vercel, Vercel
Blob, Vitest, Node.js, MTA elevator and escalator open data (NY State dataset `rc78-7x78`, MTA
equipment master, MTA live outage feed).

---

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

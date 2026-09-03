# Devpost submission text

Paste-ready. Field names match the Devpost submission form for The WebMCP Challenge.

---

## Project name

Out of Service

## Tagline (under 100 characters)

Step-free NYC subway routing scored on real elevator failure history, for two agents at once.

(93 characters)

## Links

- Live: https://out-of-service-sepia.vercel.app
- Repo: https://github.com/kamalbuilds/out-of-service (MIT)

---

## Why this use case is a strong fit for WebMCP

A rider in a wheelchair and the person helping them are two users with different permissions
looking at the same trip. WebMCP registers tools per session from inside the page, so
`/t/<id>` and `/t/<id>?role=companion` present different tool lists to different agents on one
origin, one deployment, no auth handshake. DevTools > Application > WebMCP shows 13 tools in the
rider's window and 10 in the companion's. A server-side MCP server cannot express that, because it
never learns which browser tab is asking. The tools also change with the world: when the MTA feed
says an elevator went out, the page re-registers and `toolchange` fires, so the agent's picture of
what it can do updates because the subway changed.

## How it creates a better user experience

Times Sq-42 St to 34 St-Penn Station has three one-seat rides: the A, the C and the E. Choosing
between them today means opening the MTA status page, looking up four equipment codes by hand, and
learning only whether each is out right now. Nothing tells you how often that elevator has failed
before, or which of the three routes actually depends on it. One `route_accessible` call returns
all three routes scored: the A at 13 (low risk), the C and the E at 88 (avoid, broken), because
EL228 at Penn Station is out, non-redundant, and required by the C and E platforms. Every number
carries the query that produced it, so the rider can check the claim rather than trust it.

## What people and agents can now do together that was difficult before

Two agents can work the same trip with a real division of labour. The companion's agent watches
the live feed and calls `propose_reroute` with a reason. The rider's agent surfaces the proposal
and calls `accept_reroute`, which parks inside a confirmation card in the rider's own page. The
rider presses Confirm, or presses Reject and types why, and the rejection reaches the model as a
sentence: "The rider rejected the reroute: that transfer is too long for me." The companion's
agent cannot accept anything, in that window or by forging the call, because the server re-checks
the role. Filing a maintenance report against real MTA equipment is drafted by the agent and sent
by the human. Nothing here is possible with DOM scraping or a shared login.

## How WebMCP was implemented

`document.modelContext.registerTool` only, never `navigator.modelContext`, which moved to Document
in the 27 May 2026 draft. The runtime reads `document.modelContext` once before anything touches
it, then falls back to `@mcp-b/webmcp-polyfill`, and an on-page badge prints `native`, `polyfill`
or `unavailable`. Fifteen tools, each with a strict `inputSchema` and `readOnlyHint`;
`untrustedContentHint` on `get_trip` alone, the one tool returning text another human typed, which
is delimited before the model sees it. Every mutating tool builds its own confirm gate inside
`execute`, because WebMCP has no destructive-action annotation and `requestUserInteraction()` has
not shipped. `create_trip` and `report_broken_equipment` are declarative forms with no
`toolautosubmit`, so a person presses Submit.

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

1. **Plan the demo pair.** Pick Times Sq-42 St as the origin and 34 St-Penn Station as the
   destination, tick wheelchair, and plan the trip. Three routes come back. The A scores 13, low
   risk. The C and the E score 88, avoid, marked broken, because EL228 at Penn Station is out and
   non-redundant. Click any dotted number to open the dataset, the exact query and the row count
   behind it.
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

## Video script (under 3 minutes, first tool call visible by 0:12)

1. **0:00** Rider window, DevTools Application > WebMCP pane open on the right. Voice: "Get me
   from Times Sq to Penn Station in a wheelchair."
2. **0:12** `route_accessible` appears in Invoked Tools with its input and output. On screen: three
   route strips, elevator chips coloured reliable, watch, unreliable.
3. **0:20** Point at the A at 13 low risk and the E at 28 moderate. Rider accepts the E with
   `accept_route`. The confirm card appears; a human clicks Confirm.
4. **0:45** Second window opens the share link. Its WebMCP pane lists `propose_reroute` and
   `watch_equipment`, and `accept_reroute` is not there. Cut back to the rider pane, where
   `accept_reroute` is there and `propose_reroute` is not.
5. **1:05** Live strip: EL228 out at 34 St-Penn Station, hours out, estimated return. Second tab
   shows the same code on MTA's own status page.
6. **1:20** The E route flips to 88, avoid, broken. `toolchange` fires and `accept_reroute`'s
   description in the rider pane now reads "1 pending proposal".
7. **1:35** Companion's agent calls `propose_reroute` with the A at 13, low risk, and a typed
   reason.
8. **1:50** Rider's agent surfaces the proposal and calls `accept_reroute`. The confirm card
   appears, the rider confirms, both windows re-render with the A accepted.
9. **2:15** Rider files `report_broken_equipment` through the declarative form. The agent fills the
   fields and stops. A human presses Submit, because there is no `toolautosubmit`.
10. **2:35** Close on the numbers: 82,385 monthly rows, 695 pieces of equipment, 100% live join
    coverage, the source query visible on hover. One line: the confirm card is a record and a cost,
    not a capability boundary, per webmcp#288.

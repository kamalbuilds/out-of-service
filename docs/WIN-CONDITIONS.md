# WIN-CONDITIONS: The WebMCP Challenge (webmcp.devpost.com)

Written 2026-09-03 12:00 UTC, before the first line of product code. Deadline 20:00 UTC same day.
Sources: projects/webmcp/research/ (score-board, judges, spec, past_winners, pulse, critic, asset_verification docs)

Hardening-agent re-confirmation of the gate below, verbatim from the original entry, unchanged:
Scoreboard: first edition, no prior winners, 94 entrant repos, gap #1 (two humans' agents on one page) still empty as of this pass.
Bar to beat: 15 load-bearing tools, every write tool with a visible UI side effect, live cross-machine URL, agent-on-camera in 12s.
Asset we will own: per-equipment NYC subway elevator/escalator reliability index, MTA data.ny.gov + api-endpoint.mta.info, committed to the repo.
Off-platform buyer: a power-wheelchair user commuting Jackson Heights to Midtown, and the companion tracking their trip.
Single entry: Out of Service.
Verb the brief names: "humans and agents can interact, collaborate, and create together".
Our product performs that verb: yes, two sessions, two role-gated tool sets, one origin, unchanged by this pass.
Metric plan: 82,385-row index, >=50% live-join coverage, >=10 eval fixtures green, checked in build log and live URL.
Live by: 2026-09-03 18:00 UTC, already live; this pass only hardens the shipped surface, no new deploy milestone.
Deviation from research: none in this pass; see the Fix-agent and Diagram-agent notes below for the two prior deviations.

Scoreboard: first edition, no prior winners. Public field indexed in scoreboard.md: 10 OpenAI-built showcase apps (Verdant Market 9 tools), 94 entrant repos on GitHub since 2026-08-20, 17 Chrome demos, 34 X-announced entries. Zero entries put two humans' agents on one page (gap #1). Zero wire tools to real non-simulated hardware state (gap #3). Nearest comparables: qianshou-webmcp (wraps public OpenTripPlanner/TDX, no derived asset), Ohmni (device console, single party), redline (diff UX, no dataset).
Bar to beat: 15 load-bearing tools (sizel), 19 (overloaded), 9 (Verdant Market), every write tool with a visible UI side effect; live cross-machine URL; an agent observed calling a tool on camera in the first 12 seconds; public repo with OSS licence.
Asset we will own: per-equipment NYC subway elevator/escalator reliability index (outages per 90 days, unscheduled share, entrapments, median restore gap) derived from https://data.ny.gov/resource/rc78-7x78.json (verified 200 on 2026-09-03 11:30 UTC, 82,385 monthly rows, 695 equipment_code, 2015-01 to 2026-07) joined to live device state from https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json (verified 200, 34,650 B, 83 outages: 58 EL, 25 ES, keyless) and the equipment master https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json (verified 200, 640,848 B, fields elevatorsgtfsstopid, nextadanorth, nextadasouth, redundant). Obtained by SODA bulk pull plus aggregation, committed to the repo as a queryable index with the source query string beside every derived number.
Off-platform buyer: a power-wheelchair user commuting Jackson Heights to Midtown who has been stranded on a platform by a dead elevator, and the friend or family member who tracks their trip.
Single entry: Out of Service
Verb the brief names: "humans and agents can interact, collaborate, and create together"; "what people and agents can now do together that was difficult or impossible before"
Our product performs that verb: yes. Two humans on one origin, two agents, asymmetric per-session tool registration: the companion session registers propose_reroute and watch_equipment and never registers accept_reroute; the rider session registers accept_reroute and not propose_reroute. Code path: server-side session role -> registerTool set per role (AbortSignal-scoped) -> confirm-before-mutate inside accept_reroute execute() -> shared trip state re-renders in both windows. Verifiable by a judge in DevTools > Application > WebMCP > Available Tools in each window.
Metric plan: index built over 82,385 rows / 695 equipment ids by 14:00 UTC, row count printed in README; live-feed join coverage (matched live equipment ids / total live outage records) measured and printed at build time, target >= 50%; >= 10 expectedCall eval fixtures green; >= 1 currently-out elevator on camera with its equipment id cross-checkable on MTA's own page at the shown timestamp. Checked in the repo build log and on the live URL.
Live by: 2026-09-03 18:00 UTC, 2h before close, then untouched and monitored until winners are announced 2026-09-21.
Deviation from research: two. (1) The 7-days-before-deadline gate is impossible; the challenge was discovered on deadline day. Replaced by live 2h before close. (2) ideas_B scoped Out of Service as one human plus one agent; the companion session is added because the brief's verb is collaborative and the emptiest scoreboard gap is two-party. Care Conference (also 18/20) is rejected because its CMS asset returned 403 on four attempts.

## Live-feed agent note
Live-feed agent (src/lib/live/, src/app/api/live/, docs/LIVE.md) confirms this gate is answered and proceeds to build fetchLiveOutages(), the join to the equipment master, and the /api/live + SSE routes described in "Asset we will own" and "Metric plan" above.

## Switch condition (14:00 UTC)
Switch to Order to Correct (NYC HPD wvxf-dwi5, verified 200) only if the per-equipment index does not cover the demo station or live join coverage is under 50%. A two-session sync failure is not a switch trigger; it is a cut to single session.

## Cut order if late
1 ADA complaint draft, 2 share_trip_eta, 3 alternative_entrance, 4 live toolchange re-route, 5 declarative report form. Never cut: reliability index, live feed on camera, two-session asymmetry, eval fixtures.

## Data agent note
Data agent (scripts/, data/, src/lib/index/, docs/DATA.md) confirms this gate is answered and proceeds to build the reliability index described in "Asset we will own" above.

## Bootstrap agent note
Bootstrap agent (git init, deps, LICENSE, GitHub repo, Vercel deploy, docs/BOOTSTRAP.md) confirms this gate is answered and proceeds with infra only, touching src/app/page.tsx (placeholder) and src/app/layout.tsx (metadata title) only.

## Fix-agent note (post-judging, role-as-capability + shared simulation)
Fix agent confirms this gate is answered and unchanged from the entry above. This pass does not
change the entry, the asset, or the verb: it closes two judge-found gaps in the already-shipped
two-session asymmetry (jude-gao 16/20, andrew-galloni 15/20) — role becomes a per-link capability
token instead of a self-declared string, and the `?demo=1` simulated outage becomes trip state
shared over the existing SSE stream instead of one tab's local React state. No new track, no new
entry, no new asset.

## Diagram-agent note (two-sessions re-render, key-based links)
Diagram agent confirms this gate is answered and unchanged from the entry above. This pass only
re-renders video/diagrams/two-sessions.png to reflect the role-as-capability fix already recorded
above (?k=<role> key replacing ?role=, corrected registered-tool counts, the added capability
caption). No product code, no new track, no new entry, no new asset.

## Hardening-agent note (post-judging, input caps + status codes + rate limiting + REST spotlighting)
Hardening agent confirms this gate is answered and unchanged from the entry above. This pass
closes execution-quality gaps named across the judging docs (andrew-galloni, jude-gao): free-text
fields (notes, report descriptions, reroute reasons, equipment codes) are rejected with 400 over
their length ceiling instead of silently truncated; a stale-write retry exhaustion is a 409 and an
unknown trip id on the action route is a 404, not the previous 500/400; `POST /api/trip` and `POST
/api/trip/:id/action` are rate-limited per IP and per trip (60/min, 429 + Retry-After) via the
existing Upstash/KV REST client with an in-memory fallback; `GET /api/trip/:id` and the trip SSE
stream apply the same spotlighting `get_trip` already applies to free text, so the plain REST
surface carries the identical untrusted-content boundary (the trip page itself unwraps it before
display, since a person reading their own page is not the model the boundary is for); trip JSON
responses carry `Cache-Control: private, no-store`. No new track, no new entry, no new asset, no
change to the verb or the two-session shape.

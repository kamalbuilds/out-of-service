# Win conditions: WebMCP Challenge (Devpost, first edition)

Answered from existing project research already on disk (the top-level `research/` folder's
94-repo competitor survey and past-Devpost-winners study) and the round-2 judging pass
(`docs/internal/judging/ROUND2.md`),
not written before the idea/build was chosen. This entry is hours from the 08:00 UTC deadline,
already built, deployed, and mid-fix on a judge-flagged defect. This file exists to satisfy the
win-conditions gate before touching `.ts`/`.tsx`, not to re-litigate the idea.

Scoreboard: First edition of the WebMCP Challenge, no prior winners. Nearest analogues
(`research/past_winners.md`): OpenAI's own gpt-oss/Build Week hackathons and two Google Chrome
Built-in AI Challenge editions. Winners there are narrow single-user-journey tools targeting an
underserved, emotionally legible audience (motor disability, dysarthria, memory loss) with a
named domain-credible user, not generic productivity. Live competitor set for this exact
challenge (`research/scoreboard.md`): 94 public repos since 2026-08-20, ~25-30 of them a
"agent proposes, human approves" consent pattern; zero of the 94 stage two humans with different
tool permissions on one page (scoreboard.md gap 1).

Bar to beat: No numeric leaderboard exists (Devpost judged, not usage-ranked). The bar is
qualitative: reproduce past-winner traits research identifies as decisive - a named
domain-credible user/validator, a documented demo that reproduces live, and a differentiated
capability nothing else in the 94-repo field has staged.

Asset we will own: A derived NYC subway accessibility reliability index built from 24 months of
MTA elevator/escalator availability, outage and entrapment history, joined per-equipment to the
live outage feed (`data/index.json`, `scripts/build-index.ts`), plus the two-role WebMCP tool
layer (rider vs. companion tool sets, enforced server-side) built on top of it. This is not a
wrapper around a single public endpoint; it took real ETL work across three MTA datasets and is
usable by any transit or trip-planning consumer independent of this app.

Off-platform buyer: A wheelchair or mobility-device subway rider in NYC, and a person tracking
that rider's trip (family member, aide, or travel companion) - both exist independently of
Devpost or WebMCP. Secondary: an accessibility advocacy org (CIDNY-adjacent) or a transit agency
under the July 2026 CIDNY v. MTA settlement's outage-notice obligation.

Single entry: Out of Service (this repo). No portfolio spread; the fix in progress is scoped to
this one entry.

Verb the brief names: WebMCP Challenge brief centers on agentic tool use on the open web via
`navigator.modelContext` - agents that can act on a page a human is looking at, not just chat.
The verb this entry performs: **route** (score and propose a step-free subway route) and
**confirm** (a human-in-the-loop accept/reject on every mutating tool call), with a second,
differently-permissioned agent (**propose**, never **accept**) sharing the same page.

Our product performs that verb: Yes. `route_accessible` / `create_trip` / `accept_route` /
`propose_reroute` / `accept_reroute` in `src/lib/webmcp/tools.ts` are live, typed, tested
WebMCP tool executions against a real MTA-derived dataset, gated by a real confirm card
(`src/lib/webmcp/confirm.ts`) - not read-only measurement, not a mock.

Metric plan: Devpost judged (criteria-scored), not volume-scored - no daily usage number to
hit. The number that matters before the deadline is judge-facing reproducibility: the documented
demo pair must return the documented result on every request, which is exactly the defect this
session's code change fixes (ambiguous station name silently resolving to the wrong of two
complexes, `POST /api/trip {"to":"34 St-Penn Station"}` landing on complex 318 half the time
instead of the documented 164). Checked via `npx vitest run`, `npx tsc --noEmit`, and live curl
against the deployed origin after this fix.

Live by: Already live at https://out-of-service-sepia.vercel.app; this session redeploys after
the fix, target before 06:30 UTC, ahead of the 08:00 UTC submission deadline.

Deviation from research: None for the product shape (two-role WebMCP tool asymmetry over a
real reliability index was the finding of `research/scoreboard.md` gap 1, and the build follows
it). This session's deviation from the round-2 judging doc: ROUND2.md's A3 item proposed a
non-breaking `notes` array warning while still silently picking one complex; this session
instead returns a hard 400 with structured candidates and no pick at all, because a wheelchair
routing agent acting on a silent wrong pick is worse than one that has to ask, and the fix is
still additive (new resolver function, only wired into `POST /api/trip`; the existing
`resolveStation` used elsewhere is untouched).

Round-2 text pass (this session, 2026-09-04): re-confirms the same ten answers above unchanged.
Scope is copy only, the reproducibility fix (documented demo pair -> Court Sq to Bleecker,
matching the video), the asymmetry-first lede, the origin-trial disclosure, and one StationPicker
helper-line edit, no change to the product shape, the asset, the buyer, or the verb.

Restated for this session's gate (unchanged from above, same file, same answers):
Scoreboard: 94-repo field, zero stage two humans with different tool permissions (gap 1).
Bar to beat: reproduce past-winner traits, no numeric leaderboard.
Asset we will own: the derived MTA elevator reliability index plus the two-role WebMCP tool layer.
Off-platform buyer: a wheelchair subway rider and the companion tracking their trip.
Single entry: Out of Service, this repo only.
Verb the brief names: route and confirm, agentic tool use via `navigator.modelContext`.
Our product performs that verb: yes, `route_accessible`/`accept_route`/`accept_reroute` are live.
Metric plan: judge-facing reproducibility of the documented demo pair, checked by `npx tsc --noEmit`.
Live by: already live at https://out-of-service-sepia.vercel.app.
Deviation from research: none for product shape; this session swaps which worked pair is primary.

Restated once more for the station-resolver fix session (2026-09-04, code not text):
Scoreboard: 94-repo field surveyed in research/scoreboard.md; zero entrants stage two humans with different tool permissions on one page, which is this entry's differentiator.
Bar to beat: no numeric leaderboard on Devpost; the bar is a judge-facing demo that reproduces exactly, every time, on the documented request.
Asset we will own: the derived MTA elevator/escalator reliability index (data/index.json) plus the two-role WebMCP tool layer in src/lib/webmcp/tools.ts.
Off-platform buyer: a wheelchair or mobility-device NYC subway rider, and the companion tracking that rider's trip.
Single entry: Out of Service, this repo, no portfolio.
Verb the brief names: route and confirm, agentic tool use over navigator.modelContext.
Our product performs that verb: yes; route_accessible, create_trip, accept_route, propose_reroute and accept_reroute execute against the real index and a real confirm gate today.
Metric plan: judge-facing reproducibility of POST /api/trip against the documented station pair, verified by npx vitest run, npx tsc --noEmit and live curl post-deploy.
Live by: already live at https://out-of-service-sepia.vercel.app; this session redeploys after the fix, before the 08:00 UTC deadline.
Deviation from research: none; this is the exact code fix ROUND2.md's A3 item flagged (ambiguous station resolution), tightened from a silent-pick-plus-note to a 400 with structured candidates because a routing agent should never guess for a wheelchair user.

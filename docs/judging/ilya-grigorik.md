# Judging: Out of Service — Ilya Grigorik, Distinguished Engineer, Shopify

## 1. What I did

No browser session for this pass. Everything below is `curl` against the deployed origin, one
`GET` through Scrapling against the server-rendered HTML, and a read of the committed source and
data files. Every number quoted in this review was independently reproduced, not copied from the
README.

**Health and index counts.**
```
GET /api/health
{"ok":true,"index":{"rows":695,"elevators":413,"escalators":282,"stations":123,"currentlyOut":77,...},
 "routing":{"graph":{"nodes":123,"rideEdges":558,"assertedRideEdges":472,"inferredRideEdges":86,...}}}
```
This matches `data/index-meta.json`'s `tier_histogram` (EL n=413, ES n=282) and README's stated
695/413/282/123, and `docs/ROUTING.md`'s printed graph stats (123/558/472/86) line for line.

**The demo trip, reproduced live, not read off the page.** `/api/stations` gives gtfs stop id
`A27` for Times Sq-42 St (A/C/E) and `A28` for 34 St-Penn Station (A/C/E). I posted:
```
POST /api/trip {"from":"A27","to":"A28","constraints":{"wheelchair":true}}
-> A: rawScore 13, riskLabel "low risk", broken false
-> E: rawScore 88, riskLabel "avoid", broken true
-> C: rawScore 88, riskLabel "avoid", broken true
```
This is an exact match to the README and DEVPOST.md's headline claim (A=13, C/E=88, EL228 out and
non-redundant). Not close, not directionally right — the same integers.

**The denial, exercised, not asserted.** I accepted route `r_c405483d` as rider, then called the
companion path directly:
```
POST /api/trip/tiguw5rjde/action {"type":"accept_reroute","role":"companion","payload":{"proposalId":"p1"}}
-> 403 {"error":"Only the rider can accept reroute. You are the companion: propose a reroute
   instead and the rider confirms it."}
```
Traced to `src/lib/store/actions.ts:26`, a template (`` `Only the rider can ${type...}` ``), not a
hardcoded string for the README's screenshot. The 403 is server-side, independent of whatever
tools a client claims to have — this is the actual security boundary, and it held when I forged
the call with no browser, no cookie, no session at all.

**Tests, actually run, not quoted.** `npx vitest run`: `Test Files 5 passed (5)`, `Tests 118 passed
(118)`, 8.82s. `evals/fixtures/` has exactly 17 files, matching the claimed 17 fixtures. These are
the two most falsifiable numbers in the README and both check out on this build.

**Honest degradation under a non-agentic fetch.** Scrapling's `get` is an HTTP client, not a
JS-executing browser, so it never installs `document.modelContext` or the polyfill. The
server-rendered `/t/<id>` HTML I pulled back shows `data-webmcp-layer="unavailable"`, `0 tools`,
and the on-page copy: *"No `document.modelContext` in this browser and the polyfill did not
install."* The product does not fake a tool count for a client that can't run one. That is a
point in its favor, not a gap — I simply could not personally observe the 13-vs-10 tool-count
split from outside a real browser in this pass; I traced it in source (`toolsForRole` in
`src/lib/webmcp/register.ts`, role-gated) and in the 17 eval fixtures instead of watching DevTools.

**What I did not have time to check.** Live vs. build-time drift: `/api/health` right now reports
92 live outage rows / 57 current / coverage 1.0, while `data/index-meta.json`'s committed build
(2026-09-03T11:27Z) recorded 85 live rows / 77 matched. Both are internally consistent (the MTA
feed moves every few minutes, the repo commits a snapshot), but a reader skimming the README gets
one frozen number and the live API gives another an hour later. That is disclosed nowhere as
"this number moves."

## 2. Scores

**WebMCP Leverage: 4/5.** Fifteen real tools with strict input schemas, role-gated registration
I traced in `register.ts`, `untrustedContentHint` used exactly once and correctly (on the one tool
that returns another human's free text), and a documented, deliberate choice to skip the
`usewebmcp` hook because its `.d.ts` doesn't pass `{ signal }` — that is someone who read the spec,
not someone who copy-pasted an example. One point off because I could not personally watch an
agent invoke a tool in this pass; the DevTools Available-Tools count is asserted in docs, not
independently observed by me.

**Execution: 4/5.** The full loop — plan, three scored routes, accept, server-enforced companion
denial, 118 passing tests, 17 valid eval fixtures — is real and I reproduced every number myself
against the live deployment, not the README. Down one point for the Chrome Origin Trial token
being unshipped, so the "real" experience needs a flag flip most reviewers won't do, and for the
build-time-vs-live-time number drift above going unflagged.

**Potential Impact: 4/5.** The Times Sq-to-Penn case is the single best "before/after" sentence in
this whole hackathon field so far: today this is four equipment codes looked up by hand on a page
that tells you only current status, not history; here it's one call returning three routes with an
explicit, sourced risk delta (13 vs. 88) and the exact failing part named. That is precisely the
"clicking through six screens becomes one call" standard the organisers asked for, with the actual
before/after numbers, not a vibe. It loses a point because there is no usage number behind it —
no rider study, no agent-call count, no adoption path stated — it's a well-evidenced mechanism
demo, not evidence of impact at scale, and I have nothing here like the MCP-call-growth numbers
Resend or Datadog can show.

**Creativity & Ambition: 4/5.** Two roles, one origin, different tool lists from the same
`document.modelContext`, re-registering on `toolchange` when the world changes underneath the
agent — that's a genuinely different shape than the "one agent, one tool list" demos this category
will be full of, and it is a shape a server-side MCP endpoint structurally cannot produce, which
the README states correctly and I have no reason to doubt after reading `register.ts`. Not a 5
because the underlying idea — score a route by the reliability of its physical dependencies — is
adjacent to well-trodden reliability-scoring/observability work; the novelty is concentrated in the
two-agent WebMCP mechanics, not in the domain modeling.

**Total: 16/20**

## 3. One change that moves my score up

Put a `builtAt` / `liveAt` timestamp pair next to every number in the README and DEVPOST that can
drift between the committed index build and the live API — the 82,385-row / 695-equipment /
77-of-77-coverage figures are all point-in-time. One sentence ("these are the 2026-09-03 build;
call `/api/health` for the current live count") in `README.md` right after the data table would
turn a number a skeptical reader has to independently verify (which I did, and it moved) into one
they can trust on sight.

## 4. What would make me distrust this

If the companion's 403 turned out to be enforced only in the UI and the API accepted the forged
call — it didn't, I checked directly with curl and no browser in the loop, and it held. If the
13/88 route scores in the README turned out to be hand-picked screenshots rather than what the
live scorer actually returns today — they weren't; I regenerated them from a fresh POST. The thing
that would flip we-trust to we-don't is exactly the thing that didn't happen here: a number in the
doc that the live system, queried independently, refuses to reproduce.

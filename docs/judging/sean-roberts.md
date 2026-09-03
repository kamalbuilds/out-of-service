# Sean Roberts — VP of Applied AI, Netlify

Lens: I promote this hackathon myself and I track MCP/agent-usage growth across the industry as
"AX" (agent experience) — Resend's call volume, Datadog/Figma/Atlassian putting MCP on earnings
calls. That means I default to skeptical of anyone dressing up a feature as a platform pitch, and
I read for one thing above all: is there a number I can check, or is this a sentence that would
survive being said about literally any submission in this pile. No browser session for this pass;
scored the way a judge reading only text, with a couple of live reads, actually would.

## 1. What I did

- Read `docs/JUDGING-PROTOCOL.md` and my row in `research/judges.md` (lens: substance over
  platform promotion, is the product real for its named user).
- Read `docs/DEVPOST.md` in full: tagline, all four organiser-question answers, testing
  instructions, video script.
- Read `README.md` in full: tool table, data section, routing section, known limitations.
- Grepped both files for the organiser's named bad words and for prize amounts:
  `grep -niE "seamless|leverage[ds]?|empower|revolution|cutting-edge"` → **zero hits** in either
  file. `grep -niE '\$[0-9]|prize'` → **zero hits**. Nothing to dock here.
- Pulled the live surfaces directly instead of trusting the doc's numbers:
  - `curl https://out-of-service-sepia.vercel.app/api/health` → real response, not a stub:
    `"index":{"rows":695,"elevators":413,"escalators":282,"stations":123,"currentlyOut":77}`,
    `"routing":{"graph":{"nodes":123,"rideEdges":558,...}}`, and a live block with
    `"outages":92,"coverage":1,"stale":false,"fetchedAt":"2026-09-03T13:20:02.734Z"` pointing at
    the actual MTA endpoint (`api-endpoint.mta.info/.../nyct_ene.json`). These are the same
    numbers the README quotes (695 records, 123 stations, 413/282 split), not rounder marketing
    figures substituted for the real ones.
  - `curl https://out-of-service-sepia.vercel.app/api/live` → 57 current outages, 35 upcoming,
    with per-record fields (`equipmentCode`, `nextAdaNorth`, `redundant`, `hoursOut`) that match
    the schema the README and DEVPOST describe. This isn't a mocked JSON blob; it's live transit
    data with a timestamp nine minutes before I fetched it.
  - Server-rendered text of `/` via a plain GET (no JS execution): the page itself contains
    `EL290X · 675 days out · 42St/Port Authority-Bus Terminal` — the exact figure the README's
    "How to try it" section quotes ("EL290X ... has been out since 28 October 2024, roughly 675
    days"). Same number on two independent reads (server HTML and README prose), which is what
    a checkable claim looks like.
  - `curl https://api.github.com/repos/kamalbuilds/out-of-service`: `created_at:
    2026-09-03T10:51:25Z`, MIT license present. Commit history has zero commits before Aug 26
    2026 across 37 pages. This directly corroborates the "What is new since 25 August 2026:
    Everything" line in DEVPOST.md — I didn't just take the doc's word for it, I read the system
    that would falsify it if it were lying.

Net: the numbers in the text match the numbers on the live endpoints, which match the repo's own
git history. That's the opposite of what I usually find when I do this check.

## 2. Scores (1–5)

| Criterion | Score | Why |
|---|---|---|
| WebMCP Leverage | 4/5 | Fifteen tools with role-gated registration, a precise native-vs-polyfill fallback (`document.modelContext` only, explicitly never `navigator.modelContext`), `untrustedContentHint` used on exactly the one tool that returns another human's free text, and declarative form tools built to withhold `toolautosubmit` on purpose — this reads like people who hit the spec's actual edge cases, not a wrapper around a REST call; docked one point because the "13 tools vs 10 tools" split is a DevTools-pane artifact I can't verify from text and curl alone, only trust as asserted. |
| Execution | 4/5 | The live site isn't a facade: `/api/health` and `/api/live` return real, internally-consistent numbers that match the README almost row for row, and the doc names its own two prior scoring bugs (the entrapment-clamp bug, the escalator p90=0 bug) instead of hiding them, which is the opposite of demoware; docked one point because a text-only pass can confirm the data pipeline is real but not that the reroute confirm-card loop completes end to end without a hand on the mouse. |
| Potential Impact | 4/5 | The organiser's own bar — a specific, checkable sentence instead of a vague one — is met: "the A at 13 (low risk), the C and the E at 88 (avoid, broken)" tied to a named, non-redundant elevator (EL228) at a real station beats "helps wheelchair users navigate the subway" by a mile; would be a 5 if the doc closed the loop into one explicit before/after sentence with a number on both sides (it gestures at "four equipment codes looked up by hand" but never states "4 lookups, ~2 minutes becomes 1 call"). |
| Creativity & Ambition | 4/5 | Two roles, two different tool lists, one origin, no auth handshake, no second deployment is a genuinely different shape than most hackathon entries, and `propose_reroute` → human-gated `accept_reroute` is real two-agent coordination, not a single-agent CRUD demo; not a 5 because the underlying idea — score routes on outage history — is one dataset join short of a decent static webapp, and WebMCP is what makes it agent-operable rather than what makes the idea itself new. |

**Total: 16/20**

## 3. The one change that moves my score up

`docs/DEVPOST.md`, section "How it creates a better user experience": replace the closing
sentence of the first paragraph with an explicit before/after pair in the same units, e.g. "Today:
4 equipment-code lookups across two MTA pages, roughly 2 minutes of manual cross-referencing.
Here: 1 `route_accessible` call, under a second." The material for this is already in the
paragraph (four equipment codes, one call) — it just never gets compressed into the single
quantified sentence the organiser explicitly asked for ("an agent can complete a multi-step
booking in one turn instead of clicking through six screens" is their model). That's a Potential
Impact bump, and it would likely also read as more ambitious rather than less.

## 4. What would make me distrust this

Nothing I checked contradicted the text — that's the honest finding, not a hedge. If I had to name
the single thing that would flip me to distrust on a second pass: if the "13 tools / 10 tools"
DevTools claim didn't reproduce when someone actually opened the companion link side by side with
the rider window, that would be the one unverifiable-from-text assertion the whole "two agents, one
origin" pitch rests on, and a broken repro there would undercut both WebMCP Leverage and Creativity
in one shot. Separately: the confirmation card is disclosed, unprompted, as *not* a security
boundary (webmcp#288, the server-side role check is what actually holds) — that's the kind of
self-report that raises my trust, not lowers it, because it's the opposite of overstating what's
running.

## 5. Total

**16/20**

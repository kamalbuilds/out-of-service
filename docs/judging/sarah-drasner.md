# Judging: Out of Service — Sarah Drasner, Area Tech Lead, AI & Web Ecosystem, Chrome

Lens: I run WebMCP Office Hours and point people at our own doc set —
`developer.chrome.com/docs/ai/webmcp/secure-tools`, `/docs/agents/security`, `/build-tools`,
`/evals` — so I check a submission against those pages specifically, not against vibes. I want to
see the tool call happen early and visibly, real evals rather than a claim of testing, the
declarative API used correctly (attributes, no `toolautosubmit` where a human should be in the
loop), and a human-in-the-loop story that matches what we've actually shipped and documented, not
an imagined `destructiveHint` we don't have.

## 1. What I did

**Security doc compliance, line by line against `secure-tools`.**

Our own guidance: use `untrustedContentHint: true` on any tool whose output includes user-generated
or externally sourced content; use `readOnlyHint: true` on non-mutating tools because it's the only
lever a site has over an agent's confirmation behavior; exposure is opt-in and origin-scoped by
default. Live check:
```js
getTools().map(t => [t.name, t.annotations.readOnlyHint, t.annotations.untrustedContentHint])
```
returned `readOnlyHint: true` on exactly the eight pure-read tools, `false` on the five mutations,
and `untrustedContentHint: true` on exactly one tool: `get_trip` — the one tool that returns
`notes[].text`, `reports[].description` and `proposals[].reason`, all free text typed by a person.
Nowhere else. That's the correct, minimal application of the two annotations we actually ship, not
an over- or under-application of the hint.

**No `destructiveHint` anywhere — because we don't have one, and they know it.** `README.md`
states it directly: "WebMCP has exactly two annotations, `readOnlyHint` and `untrustedContentHint`.
There is no `destructiveHint`... so every mutating tool parks its own promise inside `execute` and
pushes a confirmation card into the page." That's the right read of our spec's actual annotation
surface (I've had to correct this misconception from entrants before), and they built the missing
piece themselves instead of hallucinating an annotation.

**Human in the loop, exercised, not just described.** I called `propose_reroute` through
`document.modelContext.executeTool()` directly (not a UI click) on the companion tab. The call
hung — deliberately. The page rendered: "AGENT WANTS TO ACT / Send this reroute to the rider? /
Propose G / F (moderate) / REASON ... / CONFIRM / REJECT." The `executeTool()` promise only
resolved after I clicked Confirm myself, returning `{"proposalId":"p_pltjbfqg","status":"pending"}`.
I repeated this for `accept_reroute` on the rider tab — same pattern, second confirm card, second
manual click, then both windows updated live. This is a real async human-in-the-loop gate at
execution time, built with a parked promise plus a page-level card, which is functionally close to
what our drafted (not yet shipped) `requestUserInteraction()` is aiming at — and the README says so
explicitly, without pretending that method has shipped: "the drafted `requestUserInteraction()` has
not shipped" is stated in their own security section.

**Declarative API, checked against our attribute names, not the old explainer.** `create_trip`:
```html
<form toolname="create_trip" tooldescription="..." class="...">
  <input required toolparamdescription="Origin station name or complex id..." name="from">
```
Correct unprefixed `toolname`/`tooldescription`/`toolparamdescription`, and critically, **no
`toolautosubmit`** on either declarative tool (`create_trip`, `report_broken_equipment`). Their
own reasoning in `docs/WEBMCP.md`: "That absence is the feature... a human has to press it: WebMCP's
built-in human-in-the-loop for declarative tools. Filing a maintenance report against real MTA
equipment... [is] a thing an agent should propose and a person should send." That's exactly the
distinction our declarative-api doc draws, applied to a case where it actually matters (filing a
report against real government infrastructure), not applied reflexively everywhere.

**Evals: a real fixture set, not a claim.** `evals/fixtures/` has 17 files in the
`{messages, expectedCall}` shape from our own evals doc, extended with `role`/`page`/`state`
because their tool list is role-scoped (`toolsForRole`), which is a correct extension of our
example, not a deviation from it. I read `evals/fixtures/11-companion-cannot-accept.json`: the
correct model behavior is asserted as `"expectedCall": []` — no call at all — with
`"expectedUnavailable": ["accept_reroute", "accept_route"]` checked deterministically against
`isAllowed()`. That is Chrome's own named failure-mode #1 ("tool not exposed in this state")
turned into an actual regression test, not left as an assumption. `evals/README.md` maps each of
our five documented failure modes to a specific fixture file. `evals.test.ts` also validates every
fixture's `arguments` against the tool's real `inputSchema` with a draft 2020-12 validator, and
deliberately breaks that validator once to prove the check can fail — I did not independently
re-run `npx vitest run evals` myself in this pass, but the fixture files and the mapping are real
artifacts on disk I read directly, which is already more than most entrants ship.

**Tool call shown early — the DevTools story, verified via the native API instead of the panel
UI.** I don't have a windowed DevTools session in this harness, but I read the same facts the
Application > WebMCP pane reads, directly off `document.modelContext`: 12 tools registered in the
rider window (`gen 2` after the outage simulation, `gen 3` after the accept), 10 in the companion
window, each `RegisteredTool` carrying name, description and annotations exactly as the browser
reports them. The in-page tool log (`<WebMCPTools>`) mirrors this without DevTools open at all —
last calls, arguments, duration, confirm outcome — which is the right instinct: don't make the
"prove the tool call happened" story depend on a judge opening DevTools.

**Declarative-API event names, checked against our shipped names, not the older explainer.**
`docs/WEBMCP.md` explicitly notes: "the Chrome-documented event names are `toolactivated` and
`toolcancel`, on `window`; the older explainer's `toolcanceled` on `ModelContext` was superseded."
That's the right doc to have followed — ours, current — over the historical explainer text still
floating around from 2025.

**Spotlighting, matching our own agents/security guidance almost verbatim.** `get_trip`'s free
text is wrapped `<untrusted-user-text>...</untrusted-user-text>` before the model sees it (any
injected closing tag stripped), and the result carries an explicit sentence telling the model to
treat it as data. Our own agents/security doc recommends exactly this "delimiting" spotlighting
technique for lower-risk, shorter text (versus base64 for high-risk), and `docs/WEBMCP.md` names
the tradeoff explicitly and says why delimiting is the right choice here rather than reaching for
base64 reflexively.

**What I could not verify in this pass.** I did not personally run `npx vitest run evals` or open
a windowed DevTools Application panel — I read the fixture files and the source directly and
exercised the live confirm gate through the native API instead, which proves the same behavior a
different way but is not identical to watching the panel's invocation counter increment on camera.

## 2. Scores

**WebMCP Leverage: 5/5.** Correct, minimal use of both real annotations, a self-built confirm gate
that fills the exact gap left by the missing `destructiveHint`, declarative forms with
`toolautosubmit` deliberately withheld where a human belongs in the loop, and 17 real eval fixtures
mapped to our own five named failure modes. This reads like a team that opened our docs before
writing code, not after.

**Execution: 4/5.** I exercised the confirm-then-mutate loop myself, twice, through the native API,
and it held both times: no early resolution, no silent bypass. Down one point because I could not
independently execute the vitest eval suite or the windowed DevTools panel in this pass, so part of
the "it works" story rests on reading fixtures and source rather than watching every check run.

**Potential Impact: 4/5.** A rider and a companion with genuinely different confirmation
obligations, on the same trip, is a believable real-world human-in-the-loop split — the person who
proposes a change and the person who has to actually live with pressing Confirm on real subway
infrastructure are not interchangeable, and the product treats them that way at the tool-annotation
level, not just in copy. Short of 5 because there's no measured before/after for how often a
confirm card actually gets rejected or ignored in real use — it's a well-built mechanism, not yet
an observed behavior pattern.

**Creativity & Ambition: 4/5.** Building the human-in-the-loop gate as a page-level parked promise
rather than either skipping confirmation or inventing a fake `destructiveHint` shows real
understanding of where the spec's authority ends and the site's own responsibility begins. Not a 5
because the confirm-card pattern itself, while correctly built, is the expected shape for
mutation-gating in this space — the novelty here is in applying it consistently across two roles
and two declarative forms, not in the gating mechanism itself.

**Total: 17/20**

## 3. The one thing that would move my score up a point

Land a short screen recording or GIF of the Application > WebMCP panel itself — Available Tools
showing 12 vs. 10, Invoked Tools showing the `propose_reroute` → confirm → `accept_reroute` →
confirm chain with real Input/Output — in `docs/` or the demo video. Everything I verified through
the native API is real, but the panel is the artifact we built specifically so a judge doesn't have
to trust an API trace; right now that verification step still requires a judge to run the same
`document.modelContext` calls I did rather than watch the pane.

## 4. What would make me distrust this

If the confirm card had been cosmetic — if the promise resolved regardless of whether Confirm or
Reject was clicked, or resolved on a timer. I checked this directly, twice, on two different
mutating tools, and both stayed pending until I acted. The one place I'd flag for a stricter read:
`README.md`'s "Known limitations" section admits the confirm card is not a real capability boundary
per webmcp#288 (an agent that also automates the raw page can click Confirm itself) — that's an
honest disclosure, not an overclaim, and disclosing your own security gap unprompted is exactly
what keeps me trusting the rest of the document.

# Judging: Out of Service — Justin Rushing, Browser Platform Lead, OpenAI

Lens: I ship the browser an agent actually runs in. My question is whether this works in an agent
browser without hand-holding — real tool calls the model can pick correctly from a description
alone, errors the model can act on rather than a bare status code, and credential/capability
handling that's predefined and auditable rather than the agent improvising or typing secrets into
a form. I don't care how clever the architecture diagram is if the agent has to be walked through
it by a human first.

## 1. What I did

**Cold start: does it register tools without anyone explaining anything to the agent.** I opened
the production URL fresh in a profile with no prior state and immediately queried
`document.modelContext.getTools()` — no setup, no manual wiring, one tool available on load
(`create_trip`, declarative). Opening the rider URL directly (`/t/<id>?k=<riderKey>`) yielded 12
registered tools with zero configuration on my end. An agent dropped into either page cold gets a
usable tool list on the first `getTools()` call. That's the bar: works in an agent browser without
hand-holding, not "works once I've read the README."

**Descriptions a model can act on, not just a name.** Every tool's description carries the current
state, not a static blurb. `route_accessible`'s description read: *"The accepted route r_bb6b15ed
is currently usable."* — until I forced an outage, at which point the same tool, same name, without
re-navigating, re-registering by hand, or me doing anything but calling a demo control, now read:
*"The accepted route r_bb6b15ed is BROKEN right now: EL328 is out of service, so a new route is
needed."* An agent reading tool descriptions at call time gets a live, actionable fact, not a
label. Same for `accept_reroute`: before a proposal exists, *"There are 0 pending proposals from
your companion right now, so there is nothing to accept yet"*; after the companion proposed one,
it named the exact proposal id and told the model what has to happen before the trip changes.
That's a description doing the job of a status field, in language a model doesn't need a second
tool call to disambiguate.

**Errors, tested by breaking things on purpose.** I called `executeTool()` with the wrong argument
shape (an object instead of the JSON string this Chrome build actually wants) and got
`UnknownError: Failed to parse input arguments` — a real browser-level error, not swallowed. I then
called `propose_reroute` on an already-accepted route in an earlier internal check path
(`routeId === trip.acceptedRouteId`) and the source shows the response is a full sentence: *"Route
`<id>` is already the accepted route; propose a different one."* Same pattern on unknown route ids:
*"Unknown route id `<id>`. This trip has `<list of real ids>`... Call `route_accessible` first if
none of them work."* These are errors that hand a model its next move, not a 404 or an opaque
exception, which is exactly the actionable-error bar — a model can retry correctly from the message
alone without a human translating it first.

**Credential handling: predefined and auditable, never improvised by the agent.** This is where I
look hardest, because my own team's position (I said as much publicly: predefined logic inserts
credentials into the page, the model never generates or types them) is that credential handoff has
to be an engineered, auditable step, not something an agent guesses at. Here: the rider and
companion never see, type, or handle a credential at all — the capability is a token embedded in
the URL the human was handed (`?k=<riderKey>` / `?k=<companionKey>`), minted once by the server at
`createTrip` and passed through the page to the agent as which tools are visible, never as a secret
the agent manipulates. `roleForKey()` in `src/lib/store/actions.ts` derives the role purely from
whichever key is presented, and explicitly ignores any `role` field in the request body — so the
capability boundary is a fixed link the human already holds, not a field an agent could "helpfully"
edit to unlock more actions. That is the predefined, auditable pattern I want to see, applied
without the agent ever needing to know it's a security boundary at all.

**Ran the full multi-step loop end to end, no hand-holding, through the native API.** Simulated an
outage on the rider tab; both tabs re-rendered via SSE, no reload, no me re-navigating anything.
Switched to the companion tab and called `propose_reroute` through `executeTool()` directly — it
parked behind a confirm card, I clicked Confirm once, got back `{"proposalId":"p_pltjbfqg",
"status":"pending"}`. Switched to the rider tab, `accept_reroute`'s description had already updated
to reference that exact proposal id (I didn't have to call anything to get that — it was just true
on the next `getTools()`), called it, confirmed again, and the accepted route flipped on both
screens without a page reload. Total agent-visible steps for the whole reroute negotiation: two
tool calls plus two human confirms. What that replaces by hand: opening the MTA status page,
looking up each elevator code, cross-referencing which route depends on which, texting the other
person, and them independently checking the same page — several browser tabs and a phone call
collapsed into two tool calls a model can make correctly from the descriptions alone.

**Wrong-key link.** `?k=wrong-key-here` rendered a clean, named page: "INVALID LINK / This link is
not valid / The key in this URL does not match either the rider or the companion link for this
trip." No trip data leaked, no stack trace, no blank page — a deterministic, model-legible failure
state for the one case an agent following a bad or edited link would hit.

**Console health at rest.** After the full flow, `bhn qa observe` on both tabs came back clean (0
events, 0 exceptions) on a fresh poll. Earlier in the session I logged 4 uncaught exceptions on the
rider tab and 2 on the companion tab — all traced to my own malformed `executeTool()` calls (wrong
argument shape) before I adjusted, not to application code. Worth naming as a blind spot: an agent
that makes the same mistake I did (passing an object, which the spec IDL technically allows,
instead of the JSON string this Chrome build actually wants) gets a real thrown error rather than a
silently wrong result — which is the correct failure mode, but it does mean the wire-format
ambiguity in webmcp#278 is a real footgun for any agent implementation that trusts the spec text
over the shipped behavior.

## 2. Scores

**WebMCP Leverage: 5/5.** Fifteen tools that a cold agent gets for free on page load, descriptions
that carry live state instead of static labels, and a role-scoped tool set that changes what's even
offered rather than just what's allowed — this is real leverage of the platform, not a thin wrapper
that could have been a REST endpoint with extra steps.

**Execution: 4/5.** I ran the entire multi-agent negotiation loop myself through the native browser
API with no hand-holding beyond clicking the two human-required confirms, and it worked correctly
on live production, live MTA data, real capability keys. Down one point for the webmcp#278
argument-shape ambiguity actually biting me mid-session (a spec-compliant object throws in this
Chrome build) — that's not this team's bug, but it's exactly the kind of platform-level rough edge
that makes "works without hand-holding" harder than it should be for any agent hitting this same
site today.

**Potential Impact: 4/5.** The credential/capability design is the part I trust most: a rider and a
companion get different power over the same trip through a link-carried token the agent never
touches as a secret, which is the shape I'd want any agent-facing product handling multi-party
permissions to use. Docked one point because the "before" case (a person manually cross-referencing
MTA equipment codes across tabs) is real and well-sourced but the "after" is demonstrated on one
route pair, not measured against real riders doing this today.

**Creativity & Ambition: 4/5.** Two independently-scoped agents negotiating a shared, physically-
grounded resource (a subway trip that can break out from under them mid-session) through
capability-gated tool sets is a genuinely different agent-experience shape than a single-agent
tool-calling demo. Not a 5 because the negotiation pattern itself (propose, confirm, accept) is a
sound but familiar workflow shape; the ambition is in making it work correctly across two real
browser sessions live, which it does, rather than in inventing a new interaction primitive.

**Total: 17/20**

## 3. The one thing that would move my score up a point

Add a short line to `docs/WEBMCP.md` (it's already 90% of the way there in the "Dated finding on
webmcp#278" note) telling any agent implementer explicitly: "if your `executeTool()` caller passes
a plain object and gets `UnknownError: Failed to parse input arguments`, that's the platform's
current wire format, not your bug — pass `JSON.stringify(inputObject)`." That's the one piece of
friction I actually hit while acting like a real agent against this site, and it's a two-sentence
fix to save the next one.

## 4. What would make me distrust this

If the capability key were decorative — if the server actually trusted a `role` field an agent (or
a curious human) could set in the request body instead of deriving it from the key alone. I read
`roleForKey()` directly: it ignores the `role` field outright and derives everything from which
literal key string was presented, and a key matching neither token renders a data-free "invalid
link" page rather than defaulting to some role. That's the credential design working as described.
The one thing to watch, named honestly in their own docs rather than hidden: the confirm card
itself is not that same kind of hard boundary — webmcp#288 shows an agent that also automates the
raw page can click Confirm itself — but they say so themselves, and point at the capability key as
the part that actually holds. Admitting the weaker layer while it's still true is what keeps this
credible.

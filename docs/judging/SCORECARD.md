# Judge panel scorecard (protocol: ../../../docs/JUDGING-PROTOCOL.md)

Scored on the deployed product at https://out-of-service-sepia.vercel.app on 2026-09-03, 13:20 to 14:30 UTC.

| Judge | Leverage | Execution | Impact | Creativity | Total | Top fix |
|---|---|---|---|---|---|---|
| Alex Nahas | | | | | 17 | Ship the origin trial token so stock Chrome 149+ gets native tools |
| Sarah Drasner | | | | | 17 | Put the DevTools Application > WebMCP panel on camera |
| Justin Rushing | | | | | 17 | Document executeTool's JSON-string argument (issue #278) |
| Sean Roberts | 4 | 4 | 4 | 4 | 16 | One numeric before/after sentence in the Devpost UX section |
| Jude Gao | 5 | 3 | 4 | 4 | 16 | Role must be a capability, not a client-supplied field |
| Ilya Grigorik | 4 | 4 | 4 | 4 | 16 | Snapshot timestamp beside every number; live counts drift |
| Andrew Galloni | 4 | 4 | 3 | 4 | 15 | Same as Gao, plus 400 on oversized text, 409 on retry exhaustion, rate limit, REST spotlighting |

Composite before fixes: 16.4 / 20. Gate: 15 to 17, fix the top items, proceed.

## Fix status

| Fix | Status |
|---|---|
| Role as capability (rider and companion keys, server derives role, keys never serialised) | deployed, 11 new tests |
| Simulated outage shared through trip state, both windows re-score | deployed |
| Before/after sentence, sourced impact lines, snapshot note | committed |
| 400 oversized text, 404 unknown trip, 409 retry exhausted, 429 rate limit, REST spotlighting, no-store | in progress |
| executeTool JSON-string note | in progress |
| DevTools WebMCP panel on camera | recording plan, beat 4d |
| Origin trial token | blocked on Google sign-in in the browser (user action) |

Re-score of Gao and Galloni after the hardening deploy is recorded below when done.

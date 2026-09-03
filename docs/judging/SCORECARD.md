# Judge panel scorecard (protocol: ../../../docs/JUDGING-PROTOCOL.md)

Scored on the deployed product at https://out-of-service-sepia.vercel.app on 2026-09-03, 13:20 to 14:30 UTC.

| Judge | Leverage | Execution | Impact | Creativity | Total | After fixes | Top fix |
|---|---|---|---|---|---|---|---|
| Alex Nahas | | | | | 17 | | Ship the origin trial token so stock Chrome 149+ gets native tools |
| Sarah Drasner | | | | | 17 | | Put the DevTools Application > WebMCP panel on camera |
| Justin Rushing | | | | | 17 | | Document executeTool's JSON-string argument (issue #278) |
| Sean Roberts | 4 | 4 | 4 | 4 | 16 | | One numeric before/after sentence in the Devpost UX section |
| Jude Gao | 5 | 3 | 4 | 4 | 16 | **18** | Role must be a capability, not a client-supplied field |
| Ilya Grigorik | 4 | 4 | 4 | 4 | 16 | | Snapshot timestamp beside every number; live counts drift |
| Andrew Galloni | 4 | 4 | 3 | 4 | 15 | **17** | Same as Gao, plus 400 on oversized text, 409 on retry exhaustion, rate limit, REST spotlighting |

Composite before fixes: 16.4 / 20. Gate: 15 to 17, fix the top items, proceed.

Composite after fixes (Gao and Galloni re-scored, other five judges unchanged pending their own
re-run): (17 + 17 + 17 + 16 + 18 + 16 + 17) / 7 = **16.9 / 20**. Gao and Galloni were the two
lowest scores driving the gate; both moved up (16 to 18, 15 to 17) on the same live re-verification
pass documented in their files' "Re-score after fixes" sections.

## Fix status

| Fix | Status |
|---|---|
| Role as capability (rider and companion keys, server derives role, keys never serialised) | deployed, verified live: no-key, wrong-key, and cross-role calls all 403; GET body carries neither key |
| Simulated outage shared through trip state, both windows re-score | deployed |
| Before/after sentence, sourced impact lines, snapshot note | committed |
| 400 oversized text, 404 unknown trip, 409 retry exhausted, 429 rate limit, REST spotlighting, no-store | deployed, verified live (curl): 600-char note -> 400, bogus trip id -> 404, 70-request concurrent burst -> 28x 409 + 16x 429 with Retry-After, injected note read back through GET wrapped in `<untrusted-user-text>`, `Cache-Control: private, no-store` on GET |
| executeTool JSON-string note | in progress |
| DevTools WebMCP panel on camera | recording plan, beat 4d |
| Origin trial token | blocked on Google sign-in in the browser (user action) |

Re-score of Gao and Galloni after the hardening deploy: done, see "Re-score after fixes (14:50 UTC)"
in each judge's file. `npx vitest run` -> 9 files, 153 tests passed (up from 5 files, 118 tests).
`npx tsc --noEmit` -> clean.

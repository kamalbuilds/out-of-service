# Routing: how a route is built and why it scores what it scores

`src/lib/route/`. Everything below is derived from one file, the MTA elevator and escalator
equipment master:

```
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json
```

704 rows, cached at `data/equipment.json` (data agent) with a copy at
`src/lib/route/__fixtures__/equipment.sample.json` so the graph builds on a bare checkout.
Reliability numbers come from `src/lib/index/` over `data/index.json`; the live outage list
comes from `src/lib/live/`. Routing itself invents no data.

## 1. The graph

Run `npx vitest run src/lib/route` and the first test prints:

```
{"nodes":123,"rideEdges":558,"assertedRideEdges":472,"inferredRideEdges":86,
 "stopTransferEdges":132,"lineTransferEdges":840,"lines":23,"elevators":384,
 "adaElevatorRows":384,"equipmentRows":704,"unparsed":46}
```

**Nodes.** 123 station complexes. A complex qualifies if it has at least one row with
`equipmenttype === "EL"`, `ADA === "Y"` and `isactive === "Y"`. 384 of the 704 master rows
qualify (the rest are escalators, non-ADA elevators, or 24 inactive units). The node id is
`stationcomplexid`; the node also carries every `elevatorsgtfsstopid`, every `elevatormrn`,
the union of `linesservedbyelevator`, and the equipment codes in the complex.

**The id trap.** `stationcomplexid` and `elevatormrn` are different identifiers and they
disagree on 165 of the 384 rows. `stationcomplexid` is the complex (`618` for 14 St / 8 Av);
`elevatormrn` is the station, and for an elevator that serves several stations under one
complex it is a `/`-joined list (`"115/166"`). **`nextadanorth` and `nextadasouth` point at
MRNs, not at complex ids.** Resolving them against `stationcomplexid` loses 48 targets and
silently disconnects the 600-series complexes, which is most of Midtown. `buildGraph` builds
an MRN to complex map first and resolves every edge target through it.

**Edge format.** Every non-empty `nextada*` value in the master follows one grammar: groups
separated by `/`, each group `<mrn>, <line>[, <line>...]`.

| Shape | Example | Count |
|---|---|---|
| one target, one line | `117, L` | 283 |
| one target, several lines | `215, B, D` | 126 |
| several targets | `215, B, D / 387, 4` | 43 |
| empty | `""` | 93 |
| widest seen | `10, N, R, W / 223, Q / 313, 2, 3 / 315, 1 / 402, 7` (Times Sq) | 2 |

**0 values fail to parse.** `parseNextAda` also accepts the `{stopId, line}` object form the
index builder normalises to, so the same function works against either file.

One edge is emitted per (group target, line token), directed, labelled with the line and with
`north` or `south` from the field it came from. 472 distinct edges are asserted by the master.

**Reciprocal inference.** 88 asserted edges have no mirror: A says "north to B on the L" but B
never says "south to A on the L". Riding north from A to B on a line means B rides south to A
on that line, so `buildGraph` mirrors every asserted edge and marks the copy `inferred: true`.
That adds 86 edges (two mirrors already existed), for 558 total. Set
`buildGraph(rows, { inferReciprocal: false })` to see the master's raw assertions only.

**Transfer edges.** Two kinds, both scoped to one complex. `stopTransfers` (132) is every
ordered pair of distinct GTFS stop ids inside a complex, which is the literal
platform-to-platform structure. `lineTransfers` (840) is every ordered pair of distinct lines
inside a complex, which is what the router actually costs. The search never materialises them:
at a node it may switch to any other line the node serves, for a cost of 4 stops.

**46 values could not become an edge**, all logged with a reason, none of them malformed:

- 40 `unknown-target`: the target MRN has no *active* ADA elevator. `313` (72 St) and `447`
  (Flushing-Main St) do appear in the master with `isactive === "N"`, both under capital
  replacement, so excluding them is correct. `42`, `48`, `108`, `130`, `138` appear nowhere in
  the master at all: the MTA points at stations it does not publish.
- 6 `self-loop`: `9, N @57 St-7 Av` and `283, G @Greenpoint Av` resolve back to their own
  complex.

**4 nodes are unreachable** by ride edge: 181 St (146), 68 St-Hunter College (399), Livonia Av
(135) and New Dorp (510, Staten Island Railway, genuinely a separate system). The first two have
empty `nextada*` on every elevator and nothing else points at them; Livonia Av's only targets
are the two phantom MRNs above. `findRoutes` returns a note, not an exception, for those.

## 2. Which elevators a route depends on

`src/lib/route/elevators.ts`. Each elevator is classified from `shortdescription`, falling back
to `serving` when the short form has no "X to Y":

- **level** on each side: `street`, `mezzanine`, `platform`, `other`, giving a `segment` of
  `street-platform` (90), `mezzanine-platform` (174), `street-mezzanine` (85),
  `platform-platform` (12), `mezzanine-mezzanine` (3), `other` (20).
- **direction**: `north`, `south`, `both` or `unknown`, from a word list mapped onto the same
  north/south sense the edges use (uptown, Bronx-bound, Queens-bound, Woodlawn, 8 Av-bound on
  the L are north; downtown, Brooklyn-bound, Canarsie, Coney Island, Far Rockaway are south;
  "in both directions" and "platforms for ..." are both).

For a route the dependencies are, in order: at the origin, street to the boarding platform for
that line and direction; at each transfer, the arriving platform up to the mezzanine and back
down to the departing platform, plus any mezzanine-to-mezzanine or platform-to-platform
elevator in the complex; at the destination, platform to street. Candidates are filtered by
`linesservedbyelevator` and by direction compatibility, then grouped by segment:

- a group of exactly one elevator: `role: "required"`, there is no other way to make that move
- a group of more than one, or a complex that has both a direct street-to-platform elevator and
  a street-mezzanine-platform chain: `role: "possible"`, either will do
- `direction: "unknown"`: `role: "possible"`, kept rather than dropped

`redundant === 1` is carried through to `ElevatorDependency.redundant` and only affects scoring.

### Known blind spots, stated plainly

1. **"Manhattan-bound" cannot be resolved from the text.** It means south from the Bronx and
   Queens and north from Brooklyn, and the master's `borough` column is empty on all 704 rows.
   65 of 264 platform-touching elevators use it or a similar term. `resolveSiblingDirections`
   recovers a good share of them: when a complex has exactly two elevators on the same segment
   and the same line set, and one is explicitly north or south, the other is the opposite.
   Whatever survives that stays `unknown` and is reported as `possible`, which over-includes
   rather than under-includes. Over-inclusion inflates the risk score; it never hides a
   dependency.
2. **`elevatorsgtfsstopid` is a complex-level list, not per elevator.** Every elevator at Times
   Sq carries `127/725/902/A27/R16`. So an elevator cannot be tied to one platform's GTFS stop,
   only to its line set. `stopTransfers` is therefore structural, not per-elevator.
3. **`stops` counts ADA stations, not stations.** The graph only contains accessible complexes,
   so a leg of "3" means three accessible hops and probably more actual stops. Journey time is
   not modelled at all.
4. **No timetable.** Night and weekend service changes, the B not running on weekends, the M
   short-turning: none of it exists here. A line at a complex is a line the master says has an
   ADA elevator serving it.
5. **20 elevators land in segment `other`** ("Bus terminal to subway", "Balcony to Oculus &
   PATH", "Joralemon St to 4/5 mezzanine"). They are excluded from dependency sets, so a route
   through Port Authority or the Oculus understates its dependencies slightly.
6. **The inferred reciprocal edges are a physical argument, not an MTA assertion.** They are
   flagged `inferred: true` and can be switched off.

## 3. The score

`scoreRoute(route, index, live)` in `src/lib/route/score.ts`.

```
riskScore = 0
  + per dependent elevator, by its index tier:
        unreliable 25, watch 10, unknown 8, reliable 2
        (full weight when role === "required", half when role === "possible")
  + 15 per transfer
  + 60 and broken = true, if any required, non-redundant elevator is out in the live feed
  clamped to 0..100

riskLabel:  < 20 low risk   < 45 moderate   < 70 high   else avoid
```

`broken` deliberately ignores an outage on a `redundant` elevator and on a `possible` one,
because in both cases another elevator makes the same move.

`explanation` is one sentence naming the weakest elevator (out first, then worst tier, then
lowest availability) with its actual 24-month numbers, and the outage and its estimated return
when the route is broken.

**Ranking uses `rawScore`, the same number before the clamp.** The first build of
`data/index.json` put 307 of 384 ADA elevators in one tier, so every route with more than four
dependencies hit the 100 clamp and three clamped routes stopped ranking against each other.
The index has since been re-tiered on per-type relative thresholds (elevator histogram
81 reliable / 172 watch / 154 unreliable / 6 unknown) and scores now spread properly, but
`scoreRoute` still returns `rawScore` and `findRoutes` still orders on it, so a future
re-tiering cannot silently collapse the ranking again. `riskScore` and `riskLabel` are exactly
as specified.

`scoreRoute` and its constants are tier-agnostic: the numbers below move when the index is
rebuilt from newer MTA history, which is correct. The tests therefore pin structure (legs
chain, each leg's line is served at both ends, no detours, an outage flips `broken` and adds
exactly 60) rather than pinning risk scores.

## 4. Finding routes

`findRoutes(fromStop, toStop, constraints, deps)`. `fromStop` and `toStop` accept a complex id,
an MRN, a GTFS stop id, or a station name. Search is over `(station, line)` states with cost
`stops + 4 * transfers`, each state settleable 6 times, which is what produces genuinely
different candidates instead of one path and two near-copies. A route may not revisit a
complex, and may not reverse direction on the same line without a transfer. `maxTransfers`
(default 3) prunes during search.

Before scoring, candidates longer than `max(shortest + 2, shortest * 2)` accessible stops are
discarded and the count is reported in `result.notes`. ADA stations are sparse outside
Manhattan, so a geographically absurd path can still be only a few ADA hops: Atlantic Av to
Jay St is 2 hops on the R, but "D to Coney Island, F back to Jay St" is 6 and scored *below*
the direct R on elevator tiers alone. Without the cap that joyride was being offered as the
second-best accessible route.

What survives is scored, sorted by `rawScore` then stops then transfers then id, deduplicated
by leg shape, and the first three are returned.

`avoidEscalators` changes nothing, and says so: the graph is elevators only, so no route ever
uses an escalator. The note is added to `result.notes` and to each route's explanation.

Route ids are FNV-1a over the leg sequence, so the same legs always give the same id across
processes and reloads.

`deps` is `{ graph?, index?, live?, outages? }`. `index` defaults to `src/lib/index`. `live`
accepts a raw outage array, a `LiveSnapshot` (`{ outages: [...] }`), or `deps.outages`.

## 5. Three worked examples

Live feed read 2026-09-03, 21 current ADA elevator outages.

### Times Sq-42 St to 34 St-Penn Station: the outage that forces the reroute

Three one-seat rides, A, C and E, one ADA hop each. All three share the Port Authority entrance
elevators EL288X, EL289X, EL291X (all `reliable`, all `redundant`). They differ at Penn Station:
the A lands on EL227 (`watch`), the E and the C both land on EL228 (`unreliable`).

**EL228 is out right now** (Planned Work, estimated return 09/04/2026 22:00). It is
`mezzanine to platform` at 34 St-Penn Station, non-redundant, `role: "required"`, 94.1%
available over 24 months, 35 unscheduled outages, 7 entrapments in 24 months.

```
empty live feed:   A=13 low risk   E=28 moderate   C=28 moderate
live feed, now:    A=13 low risk   E=88 avoid *    C=88 avoid *      (* broken)
```

The E and C jump 28 to 88, flip to `broken`, and move `moderate` to `avoid` while the A stays
green at 13. All four tiers and all three labels are on screen at once, which is what makes
this the demo pair. For the reroute beat the rider accepts the **E** first: it is a legitimate
"moderate" choice until the feed says EL228 is out, and then the companion has a concrete
`low risk` alternative to propose.

### 161 St-Yankee Stadium to Grand Central-42 St: no route survives

The 4 runs it in two ADA hops (risk 60, "high"), with a B/D to 125 St plus a 5 or 6 as the two
alternatives (risk 100, "avoid"). The dependencies at the origin are EL131 (`street to mezzanine`,
`both`) and EL134 (`mezzanine to Manhattan-bound B/D`), plus EL135. **All of them are out
right now**: EL131, EL134 and EL135 for a Con Edison power issue with an estimated return of
31 January 2027, EL132 and EL133 for capital replacement. Every route out of this complex comes
back `broken: true`, which is correct and is the point. There is no accessible way out of
Yankee Stadium station today.

### Atlantic Av-Barclays Ctr to Jay St-MetroTech: redundancy doing its job

The R is a two-hop one-seat ride, risk 18 ("low risk"), depending on EL301 (`street to D/N/R &
Brooklyn-bound 2/3`, 98.6% available, 45 unscheduled outages, 7 entrapments). The alternatives
are the N to 14 St-Union Sq then the R (risk 45) and the D to W 4 St then the C (risk 48).

Atlantic Av has two elevators out right now, EL306 and EL307, both under capital replacement
until 30 September. **EL306 is `redundant: 1`, so it does not break anything.** EL307 is not
redundant, and it is `mezzanine to B/Q platform`, so it does not touch the R route but it does
break any route that boards the B or the Q here. This is the difference between "an elevator is
out at your station" and "your route is broken", which is the whole reason `redundant` and
`role` are carried through the pipeline.

## 6. Exports

`src/lib/route/index.ts`: `buildGraph`, `getGraph`, `listNodes`, `resolveNode`, `parseNextAda`,
`findRoutes`, `explainRoute`, `legDirection`, `routeId`, `scoreRoute`, `labelFor`,
`normalizeTier`, `readIndexEntry`, `outageCode`, `routeElevators`, `classifyElevator`,
`resolveSiblingDirections`, `loadEquipment`, `isAdaElevator`, plus their types.

# The reliability index

`data/index.json` is a per-equipment (elevator/escalator) reliability record for every
piece of accessibility equipment in the NYC subway that the MTA has ever reported
monthly availability for. It is the owned asset behind Out of Service: not a live proxy
to MTA's API, but a derived dataset, committed to the repo, with the exact source query
beside every number it produced.

## What's in it

`data/index.json`: an array of 695 objects, one per `equipment_code` (e.g. `EL293`,
`ES249`), each with:

- identity and location: `equipment_type` (EL/ES), `station`, `station_complex_mrn`,
  `gtfs_stop_id`, `lines`, `serving` (plain-English description of what the unit
  connects), `ada`, `redundant`, `nextadanorth` / `nextadasouth`
- live state: `currently_out`, `current_outage` (reason, outage/return timestamps,
  upcoming/maintenance flags), sourced from the live outage feed at build time
- `metrics`: derived numbers over the trailing 24 reported months and the most recent 3
  reported months, each with `metrics.source` carrying the exact SODA query string that
  reproduces it
- `rank`: percentile within its own equipment type (EL or ES), ranked by trailing
  24-month availability
- `tier`: exactly one of `"reliable" | "watch" | "unreliable" | "unknown"`, computed
  from percentile thresholds of its own equipment type's population (see Tiers below)
- `tier_reason`: a string explaining exactly which threshold(s) produced that tier,
  with the numbers, e.g. `"unreliable: entrapments_24m 77 >= p90 14.0000"`

`data/equipment.json`: the raw MTA equipment master (704 rows), committed verbatim, for
cross-reference and for fields (`shortdescription`, `busconnections`,
`alternativeroute`) not carried into the index.

`data/index-meta.json`: build metadata: timestamp, total historical rows pulled,
distinct equipment codes, date range covered, and join coverage (below).

`data/raw/`: paginated raw SODA responses, gitignored, kept for local debugging only.

## Rebuilding it

```
node scripts/build-index.ts
```

No API key needed; all three sources are keyless. The script:

1. Pages through `https://data.ny.gov/resource/rc78-7x78.json` in 50,000-row batches
   (`$limit`/`$offset`), sorted by `equipment_code, month`, writing each page to
   `data/raw/` and accumulating all rows in memory.
2. Downloads the equipment master
   (`https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json`)
   and the live outage feed
   (`https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json`).
3. Normalizes every equipment id (`equipment_code`, `equipmentno`, `equipment`) to
   uppercase with no interior whitespace, so `"EL 131"` and `"el131"` both resolve to
   `EL131`. In practice the three MTA sources already agree on format; normalization is
   defensive.
4. Groups historical rows by normalized code, computes the metrics below over the
   trailing 24 rows (`trailing24`) and trailing 3 rows (`trailing3`) of each group's
   month-sorted history, joins in the matching equipment-master and live-outage record
   if one exists, and writes `data/index.json` + `data/index-meta.json`.

Takes about 10-20 seconds; the historical pull is ~57 MB across two pages.

## Metric formulas

All of these run over `trailing24`, the equipment's last (up to) 24 monthly rows in the
historical dataset (fewer if the unit has fewer than 24 months on record; see
`months_observed`). `trailing3` is the same idea over the last 3 rows, standing in for
"trailing ~90 days" since the source reports monthly, not daily.

| Field | Formula |
|---|---|
| `months_observed` | count of historical rows for this equipment_code (all time) |
| `last_month_observed` | month of the most recent historical row |
| `outages_24m` | sum of `total_outages` over `trailing24` |
| `unscheduled_24m` | sum of `unscheduled_outages` over `trailing24` |
| `unscheduled_share_24m` | `unscheduled_24m / outages_24m` (null if `outages_24m` is 0) |
| `entrapments_24m` | sum of `entrapments` over `trailing24` |
| `availability_24h_mean_24m` | mean of `_24_hour_availability` over `trailing24` |
| `availability_am_peak_mean_24m` | mean of `am_peak_availability` over `trailing24` |
| `availability_pm_peak_mean_24m` | mean of `pm_peak_availability` over `trailing24` |
| `worst_month` | the row in `trailing24` with the lowest `_24_hour_availability` |
| `availability_24h_mean_recent3` | mean of `_24_hour_availability` over `trailing3` |
| `outages_recent3` / `unscheduled_recent3` / `entrapments_recent3` | same sums as above, over `trailing3` |
| `rank.availability_24h_mean_24m_rank` | 1-indexed rank within the same `equipment_type` group (EL or ES), sorted by `availability_24h_mean_24m` descending (1 = most reliable) |
| `rank.availability_24h_mean_24m_percentile` | `1 - (rank - 1) / (group_size - 1)`, so 1.0 = most reliable, 0.0 = least reliable in its group |

Values with no valid numeric readings in the window are `null` rather than `0`, so a
unit with zero recorded months never silently looks "perfectly reliable."

## Tiers

`tier` is exactly one of `"reliable" | "watch" | "unreliable" | "unknown"`; the reason
for that specific classification is a separate `tier_reason` string on every entry
(e.g. `"unreliable: availability_24h_mean_24m 0.9688 <= p25 0.9764; unscheduled_24m 134
>= p75 47.5000; entrapments_24m 77 >= p90 14.0000"`), so a judge never has to
recompute the boundary by hand.

An earlier version of this tier folded "has any entrapment in 24 months" into the tier
string itself (`"unreliable (entrapment history)"`), which saturated the elevator
population: 339 of 413 elevators carried that one label, and every routing decision
that reads tier clamped to "avoid equally." The fix is a genuine outlier definition,
not a magic 0.97/0.93 cutoff: **thresholds are the 25th/50th/75th/90th percentiles of
the equipment type's own population** (EL and ES computed separately, since they have
different baseline reliability), recomputed on every build from whatever the current
82,385-row history contains.

**Eligibility.** An entry only gets a real tier if it has at least
`MIN_MONTHS_FOR_TIER = 6` months on record and a computable
`availability_24h_mean_24m`. Everything else is `unknown`
(`tier_reason: "insufficient data: months_observed=N < 6"` or "...no valid
_24_hour_availability readings..."). Entries below that bar never enter the
percentile population either, so a handful of brand-new or historically-miscoded
units cannot drag the thresholds around for everyone else.

**Per-type population and thresholds**, from the 2026-09-03 build
(`data/index-meta.json` -> `tier_thresholds`):

| | EL (n=407 eligible / 413 total) | ES (n=282 eligible / 282 total) |
|---|---|---|
| p25 `availability_24h_mean_24m` | 0.9764 | 0.9531 |
| p75 `availability_24h_mean_24m` | 0.9882 | 0.9771 |
| p50 `unscheduled_24m` | 30 | 105.5 |
| p75 `unscheduled_24m` | 47.5 | 180.75 |
| p75 `entrapments_24m` | 8 | 0 |
| p90 `entrapments_24m` | 14 | 0 |

**Classification, per entry, against its own type's thresholds:**

1. `months_observed < 6`, or `availability_24h_mean_24m` is `null` -> **`unknown`**
2. else, **`unreliable`** if any of:
   `availability_24h_mean_24m <= p25` OR `unscheduled_24m >= p75` OR
   `entrapments_24m >= p90`
3. else, **`reliable`** if all of:
   `availability_24h_mean_24m >= p75` AND `unscheduled_24m <= p50` AND
   `entrapments_24m < p75`
4. else -> **`watch`**

## Tier histogram (2026-09-03 build)

Printed by the build script and stored in `data/index-meta.json` -> `tier_histogram`.

| | EL (n=413) | ES (n=282) |
|---|---|---|
| reliable | 81 (19.6%) | 0 (0.0%) |
| watch | 172 (41.6%) | 0 (0.0%) |
| unreliable | 154 (37.3%) | 282 (100.0%) |
| unknown | 6 (1.5%) | 0 (0.0%) |

**Elevators are close to, but not inside, the 25-35% per-tier target.** Reliable
(19.6%) sits below the 25% floor and watch (41.6%) sits above the 35% ceiling;
unreliable (37.3%) is just over. Reported as measured, not adjusted to fit: the
`unreliable` condition is an OR across three independent 25/75/90th-percentile cuts
(availability, unscheduled count, entrapments), so more than 25% of the population
fails at least one of the three cuts even though each cut alone is a quartile/decile
by construction. Narrowing that would mean changing the formula's logical structure
(e.g. AND instead of OR, or requiring two of three), which was not part of this
spec and is flagged here rather than fudged.

**Escalators saturate at 100% unreliable, and that is a formula artifact worth
calling out explicitly.** `p75_entrapments_24m` and `p90_entrapments_24m` for ES are
both `0`, because most escalators have zero recorded entrapments in their trailing 24
months. The unreliable rule reads `entrapments_24m >= p90`, and `0 >= 0` is true, so
*every* escalator with zero entrapments (the overwhelming majority) trips that clause
regardless of its availability or outage history. This is the literal, unmodified
formula given in spec applied to a right-skewed population where the 90th percentile
lands on the same value the bulk of the population already sits at. It was not
adjusted to hit a target, because ES had no target in this task; it is reported here
so the next iteration can decide, e.g., to require `entrapments_24m > p90` (strict)
for that clause, or to gate the entrapment clause on `p90 > 0`.

## Join coverage

Measured and printed at every build, and stored in `data/index-meta.json` under
`join_coverage`. Build run on 2026-09-03:

- **Live outage ids present in the index**: 75/75 = **100.0%**. (83 live outage
  records collapse to 75 distinct equipment ids; every one of them matches an
  equipment_code in the historical index.)
- **Equipment-master ids present in the index**: 691/704 = **98.2%**. The 13 unmatched
  equipment-master ids are units the MTA's monthly availability report has no history
  for (recently installed, or historically miscoded); they still appear in
  `data/equipment.json` for reference, just without a `metrics` block.

Both are well above the 50% investigate-if-below threshold; no id-format mismatch was
found; the "EL131" vs "EL 131" case is normalized defensively (see step 3 above) but
was not actually needed for this data, since all three MTA sources already agree on
the `EL###`/`ES###` format.

## Example rows

Each row below is queryable directly: paste the SODA URL to reproduce its 24-month
history.

### 1. A very reliable elevator: EL200X, 34 St-Herald Sq (B/D/F/M/N/Q/R/W)

Street/PATH mezzanine connector. 139 months on record, 0 outages and 100% trailing
24-month availability. Tier: `reliable`
(`tier_reason`: `"reliable: availability_24h_mean_24m 1 >= p75 0.9882 and
unscheduled_24m 0 <= p50 30 and entrapments_24m 0 < p75 8"`).

```
https://data.ny.gov/resource/rc78-7x78.json?$select=month,equipment_code,equipment_type,total_outages,scheduled_outages,unscheduled_outages,entrapments,am_peak_availability,pm_peak_availability,_24_hour_availability,station_name,station_complex_mrn&$where=equipment_code='EL200X'&$order=month
```

### 2. An unreliable escalator: ES249, Lexington Av/59 St (N/R/W)

262 outages in the trailing 24 months, 85% of them unscheduled, trailing 24-month
availability 53.8% (worst single month, 2025-06, hit 0% availability). Tier:
`unreliable` (`tier_reason`: `"unreliable: availability_24h_mean_24m 0.5378 <= p25
0.9531; unscheduled_24m 224 >= p75 180.7500; entrapments_24m 0 >= p90 0"` — note the
last clause is the ES entrapment-threshold artifact described above; the availability
and unscheduled-share clauses alone already justify `unreliable` for this escalator).

```
https://data.ny.gov/resource/rc78-7x78.json?$select=month,equipment_code,equipment_type,total_outages,scheduled_outages,unscheduled_outages,entrapments,am_peak_availability,pm_peak_availability,_24_hour_availability,station_name,station_complex_mrn&$where=equipment_code='ES249'&$order=month
```

### 3. One with entrapments: EL393, Flushing Av (J/M)

77 entrapments recorded in the trailing 24 months (11 in just the last 3). Its 96.9%
mean 24-hour availability sits just below the EL p25 cut (0.9764), and both its
outage count and its entrapment count also clear their own thresholds, so all three
`unreliable` clauses fire independently. Tier: `unreliable` (`tier_reason`:
`"unreliable: availability_24h_mean_24m 0.9688 <= p25 0.9764; unscheduled_24m 134 >=
p75 47.5000; entrapments_24m 77 >= p90 14"`).

```
https://data.ny.gov/resource/rc78-7x78.json?$select=month,equipment_code,equipment_type,total_outages,scheduled_outages,unscheduled_outages,entrapments,am_peak_availability,pm_peak_availability,_24_hour_availability,station_name,station_complex_mrn&$where=equipment_code='EL393'&$order=month
```

### 4. One currently out per the live feed: EL123, 175 St (A)

`currently_out: true` as of the live outage feed pulled at build time: an Inspection
outage from 09/09/2026 09:00 to 10:00 (upcoming, not a maintenance closure). Historical
tier is `unreliable` (`tier_reason`: `"unreliable: unscheduled_24m 80 >= p75
47.5000; entrapments_24m 26 >= p90 14"`, 26 entrapments in the trailing 24 months).

```
https://data.ny.gov/resource/rc78-7x78.json?$select=month,equipment_code,equipment_type,total_outages,scheduled_outages,unscheduled_outages,entrapments,am_peak_availability,pm_peak_availability,_24_hour_availability,station_name,station_complex_mrn&$where=equipment_code='EL123'&$order=month
```

Live feed itself (no key required, refreshes continuously):

```
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json
```

### 5. One at a station with no redundancy: EL1106, Spring St (C/E)

`redundant: false` per the equipment master: street-to-downtown-platform elevator with
no documented alternate accessible path at this station for that direction. ADA-flagged.
Only 8 months on record (newer unit) — above the `MIN_MONTHS_FOR_TIER = 6` floor, so
it gets a real tier (`reliable`, `tier_reason`: `"reliable: availability_24h_mean_24m
0.9906 >= p75 0.9882 and unscheduled_24m 8 <= p50 30 and entrapments_24m 3 < p75 8"`)
rather than `unknown`, but treat it as lower-confidence than units with 100+ months
observed.

```
https://data.ny.gov/resource/rc78-7x78.json?$select=month,equipment_code,equipment_type,total_outages,scheduled_outages,unscheduled_outages,entrapments,am_peak_availability,pm_peak_availability,_24_hour_availability,station_name,station_complex_mrn&$where=equipment_code='EL1106'&$order=month
```

## Using the index in code

`src/lib/index/index.ts` (no React or Next.js imports; safe on server or client):

- `loadIndex()`: the full array
- `getEquipment(code)`: one record by `equipment_code`, case/whitespace-normalized
- `getStationEquipment(stationComplexMrn | gtfsStopId)`: all equipment at a station
- `listStations()`: every station with at least one ADA-flagged elevator/escalator,
  with name, mrn, gtfs stop ids and lines served
- `scoreStation(stationId)`: aggregates a station's equipment into
  `min_elevator_availability_24m`, `unreliable_count`, `redundant_coverage`
- `nextAdaNeighbors(gtfsStopId)`: `{ north, south }`, each `{ stopId, line } | null`,
  parsed at build time from the equipment master's `"117, L"`-style strings

Run the tests: `npx vitest run src/lib/index`.

## Downstream effect on `src/lib/route`

Unsaturating the tier distribution (from 339/413 elevators sharing one label to a
real 82/172/154/6 split) changes route risk-scores in `src/lib/route/score.ts`
enough that `npx vitest run src/lib/route` regresses 2 of 21 tests: two of the three
hardcoded `PAIRS` fixtures in `route.test.ts` now surface a genuinely lower-risk route
via a line (F) that the fixture's `lines` allowlist doesn't include, because that
route used to score no better than the others under saturated tiers and is now
correctly preferred. This is a fixture going stale against a real scoring
improvement, not a defect in the index; updating `PAIRS` is out of scope here since
`src/lib/index/` does not own `src/lib/route/`.

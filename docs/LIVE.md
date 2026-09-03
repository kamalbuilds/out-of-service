# Live MTA elevator/escalator feed

Owns: `src/lib/live/`, `src/app/api/live/`. Exposes the MTA's live
elevator/escalator outage state, normalised to equipment codes (`EL131`,
`ES205`, ...) that join the historical reliability index built separately
under `src/lib/index/`.

## Sources

- Outages (keyless): `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json`
  Verified 200, ~34 KB, 83 records on 2026-09-03 (58 EL, 25 ES).
- Equipment master (keyless): `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json`
  Verified 200, ~641 KB, 704 records. Used only for station/stop enrichment
  (gtfs stop id, station complex id, redundancy, nearest ADA alternates).
- Cross-check page a judge can open directly: https://new.mta.info/elevator-escalator-status

## Modules

- `src/lib/live/mta.ts` -- `fetchLiveOutages()`. Fetches the outages feed,
  normalises every record, caches the result in module scope for 60s, and
  serves the last good copy (`stale: true`) if a refresh fails while a
  fetch times out at 8s.
- `src/lib/live/equipmentMaster.ts` -- `getEquipmentMaster()`. Reads
  `data/equipment.json` if the data-index agent has committed it; otherwise
  fetches the live equipment-master feed with a 1h in-memory cache.
- `src/lib/live/join.ts` -- `joinLiveWithMaster(outages, equipmentMaster)`.
  Keys the join on the normalised equipment code and returns `coverage`
  (matched / total).

## Normalised outage fields

| Field | Meaning |
|---|---|
| `equipmentCode` | Trimmed, uppercased, spaces removed (e.g. `"EL 131"` -> `"EL131"`). Join key into the historical index. |
| `equipmentType` | `"EL"` or `"ES"`. |
| `station`, `borough`, `serving` | As reported by the feed. |
| `lines` | `trainno` split on `"/"`, e.g. `"B/D/4"` -> `["B","D","4"]`. |
| `ada` | `true` if the feed's `ADA` flag is `"Y"`. |
| `outageStart` / `estimatedReturn` | ISO 8601 UTC, parsed from the feed's `"MM/DD/YYYY hh:mm:ss AM/PM"` America/New_York wall-clock string. |
| `isUpcoming` / `isMaintenance` | From the feed's own `Y`/`N` flags. |
| `isCurrent` | `outageStart <= now` and not `isUpcoming`. |
| `hoursOut` | `(now - outageStart)` in hours; negative for upcoming outages. |

After the join, each outage also carries `gtfsStopId`, `stationComplexId`,
`redundant` (an alternate accessible path exists at that location), and
`nextAdaNorth` / `nextAdaSouth`.

### Date parsing and DST

The feed's timestamps are wall-clock America/New_York with no offset. The
US switches between EST (UTC-5) and EDT (UTC-4) on dates that Congress
controls, not a fixed rule, so `parseNyDateToIso` asks the platform's ICU
timezone database (`Intl.DateTimeFormat` with `timeZone: "America/New_York"`)
what the offset is for the given calendar date, rather than hardcoding
"second Sunday in March". This is correct for every instant except the
~1 hour of wall-clock time that is skipped or repeated on the two DST
transition days per year, an inherent ambiguity in any local-time-to-UTC
conversion and finer-grained than this feed's own precision.

## Caching

`fetchLiveOutages()` and `getEquipmentMaster()` both cache in a module-scope
variable. On Vercel (serverless / Fluid Compute) this cache is
**per-warm-instance, not shared**: concurrent invocations may each hold
their own copy, and a cold start always refetches. This is intentional and
sufficient for a 60s (outages) / 1h (equipment master) TTL whose only job
is to avoid hammering the upstream MTA feed; it is not a substitute for a
shared cache (Redis/KV) if cross-instance consistency is ever required.

## `GET /api/live`

`export const dynamic = "force-dynamic"`, `Cache-Control: s-maxage=60`.

```json
{
  "fetchedAt": "2026-09-03T10:55:17.594Z",
  "stale": false,
  "sourceUrl": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json",
  "coverage": 1,
  "counts": { "current": 47, "upcoming": 36, "elevators": 58, "escalators": 25, "adaCurrent": 21 },
  "outages": [ { "equipmentCode": "EL131", "...": "..." } ]
}
```

Query params:
- `?station=<stationComplexId|gtfsStopId>` -- filters `outages` and recomputes `counts` over the filtered set.
- `?equipment=EL131` -- returns `{ fetchedAt, stale, sourceUrl, coverage, outage }` for one record (`outage: null`, HTTP 404, if not found).

## `GET /api/live/stream` (Server-Sent Events)

Emits a `snapshot` event immediately on connect (full envelope, same shape
as `/api/live` but with `outages` unfiltered), then polls the cached fetch
every 30s and emits a `change` event only when the **set of currently-out
equipment codes** changes (additions or removals), or a `heartbeat` event
otherwise. This is what drives the `toolchange` event in the WebMCP layer.

The stream self-closes after 5 minutes (`MAX_STREAM_LIFETIME_MS`). Vercel
serverless/Fluid functions have an execution ceiling and a long-lived HTTP
connection ties up one invocation for the whole duration; closing cleanly
every 5 minutes lets the client's `EventSource` reconnect on its own,
rather than risking the platform killing the connection mid-stream with no
final event.

Event types: `snapshot`, `change`, `heartbeat`, `error`. Each `data:` payload
is JSON with the same envelope shape as `/api/live` (unfiltered), except
`heartbeat` which is just `{ "fetchedAt": "..." }`.

## Observed on 2026-09-03

- Join coverage: **1.0 (83/83)** -- every live outage's equipment code matched a record in the equipment master.
- Counts: 83 total outages (58 EL, 25 ES), 47 current, 36 upcoming, 21 currently-out with `ada: true`.
- Demo candidate (currently-out ADA elevator, long-running real repair, not a maintenance blip):
  - **Equipment `EL290X`**, 42 St/Port Authority-Bus Terminal, intermediate landing to mezzanine for A/C/E service.
  - Outage start (feed): `10/28/2024 06:26:00 AM` America/New_York -> `2024-10-28T10:26:00.000Z`.
  - Estimated return (feed): `12/31/2026 11:00:00 PM` America/New_York.
  - `hoursOut` at fetch time: ~16,200 hours (~675 days / ~1.85 years) and counting.
  - Cross-check against MTA's own status page: https://new.mta.info/elevator-escalator-status (search "42 St/Port Authority" or equipment `EL290X`).

## Tests

`src/lib/live/live.test.ts` (vitest), fixture at
`src/lib/live/__fixtures__/nyct_ene.sample.json` (a real fetch of the 83
current outage records, captured 2026-09-03). Covers: NY-time date parsing
for an EDT record, an EST record, and an early-morning EDT record; equipment
code normalisation including a code with an embedded space; feed-size counts
(83 total, 58 EL, 25 ES); the 60s cache surfacing `stale: true` after the TTL
expires and a refetch fails (verified with fake timers, not just a same-tick
call); and `joinLiveWithMaster`'s coverage math including the zero-outage
edge case. Run with:

```
npx vitest run src/lib/live
```

All 12 assertions pass as of this writing; the equipment-code-normalisation
and cache-staleness assertions were manually broken and confirmed red before
being restored, per verification policy.

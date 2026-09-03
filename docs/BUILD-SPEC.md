# Out of Service: build spec

NYC subway accessible routing for a rider and a companion, each with their own agent, on one page.
Every route is scored on the real outage history of the elevators it depends on, and re-scored when the
MTA live feed changes. The product is judged in The WebMCP Challenge (webmcp.devpost.com) at 20:00 UTC
2026-09-03. Read `docs/WIN-CONDITIONS.md` in the parent `projects/webmcp/docs/` for why these choices.

## The loop

1. Rider opens `/` and creates a trip: from station, to station, constraints (wheelchair, stroller, no
   escalators, max transfers). Gets a trip id and a companion link `/t/<tripId>?role=companion`.
2. Rider's agent calls `route_accessible`. Each candidate route lists the elevators it depends on, each
   with its reliability tier and the source query that produced it, and any elevator currently out.
3. Rider accepts a route. Trip state is shared server-side.
4. Companion opens the companion link. Companion's agent has `propose_reroute` and `watch_equipment` but
   the DevTools WebMCP pane in that window does NOT list `accept_reroute`.
5. The live feed changes (or the demo forces a change): an elevator on the route goes out. Both windows
   re-render; the tool set changes (`toolchange`); the companion's agent proposes a reroute; the rider's
   agent surfaces it; the rider confirms inside `accept_reroute`'s execute (confirm-before-mutate).
6. Rider files a broken-equipment report through a declarative form tool (no `toolautosubmit`; the human
   presses submit).

## Roles and tool registration (asymmetric, per session, same origin)

| Tool | rider | companion | readOnlyHint | notes |
|---|---|---|---|---|
| list_accessible_stations | yes | yes | true | name, complex id, gtfs stop ids, lines, elevator count, worst tier |
| station_status | yes | yes | true | live + history for one station |
| elevator_history | yes | yes | true | one equipment code: metrics + source query |
| current_outages | yes | yes | true | live feed, filter by station/line/ada |
| route_accessible | yes | yes | true | from,to,constraints -> up to 3 routes, scored |
| compare_routes | yes | yes | true | side by side risk for route ids in the trip |
| get_trip | yes | yes | true | shared trip state |
| create_trip | yes | no | false | confirm-before-mutate |
| accept_route | yes | no | false | pick initial route; confirm |
| accept_reroute | yes | no | false | rider only; confirm-before-mutate; the asymmetry the demo shows |
| propose_reroute | no | yes | false | companion only; adds a proposal to trip state |
| watch_equipment | yes | yes | false | subscribe codes; visible watch list |
| add_note | yes | yes | false | short note into the shared trip timeline |
| report_broken_equipment | yes | no | false | DECLARATIVE form tool, no toolautosubmit |
| share_trip | yes | no | true | returns companion URL |

Rules:
- `document.modelContext.registerTool` only (never `navigator.modelContext`). `usewebmcp` (`useWebMCP`)
  from MCP-B with `@mcp-b/webmcp-polyfill` as fallback when the native object is missing. State in the
  README which layer is active at runtime (render a small badge: "native" or "polyfill").
- Every tool has an `inputSchema` (JSON Schema, `additionalProperties: false`), a description that states
  what the human sees change, and `annotations: { readOnlyHint }`. Untrusted free text (notes, report
  descriptions) is returned with `untrustedContentHint: true` on the tool that reads it.
- Every read result carries `source` (dataset id + exact query URL + row count) where it came from the
  index or the live feed, and `fetchedAt` for live data.
- Mutations: the `execute` shows an in-page confirmation card and resolves only after the human clicks
  Confirm (or rejects with a clear message the model can act on). Errors are actionable text for the
  model, not status codes.
- Registration is scoped with an `AbortSignal` tied to component lifetime and role; switching role or
  unmounting unregisters. Re-registration on live change updates descriptions (e.g. `accept_reroute`
  description says "1 pending proposal from companion") so `toolchange` fires.
- Evals: `evals/*.json` fixtures `{messages, expectedCall:[{functionName, arguments}]}`, 10 or more,
  plus a vitest that validates every fixture's arguments against the tool's inputSchema.

## Shared types (`src/lib/types.ts`, owned by the UI agent, imported by everyone)

```ts
export type Role = "rider" | "companion";
export type Constraints = { wheelchair: boolean; stroller?: boolean; avoidEscalators: boolean; maxTransfers: number };
export type ElevatorRef = { code: string; station: string; serving: string; tier: "reliable"|"watch"|"unreliable"|"unknown"; availability24m?: number; unscheduled24m?: number; entrapments24m?: number; currentlyOut: boolean; estimatedReturn?: string; source?: { dataset: string; query: string; rows: number } };
export type RouteLeg = { line: string; fromStop: string; fromName: string; toStop: string; toName: string; stops: number };
export type Route = { id: string; legs: RouteLeg[]; transfers: number; elevators: ElevatorRef[]; riskScore: number; riskLabel: string; broken: boolean; explanation: string };
export type Proposal = { id: string; by: Role; route: Route; reason: string; createdAt: string; status: "pending"|"accepted"|"rejected" };
export type TimelineEvent = { at: string; by: Role | "system" | "agent"; kind: string; text: string };
export type Trip = { id: string; createdAt: string; from: string; to: string; fromName: string; toName: string; constraints: Constraints; candidates: Route[]; acceptedRouteId?: string; proposals: Proposal[]; watch: string[]; notes: TimelineEvent[]; reports: { id: string; equipment: string; description: string; at: string }[]; version: number };
```

## Store (`src/lib/store/`, UI agent)

`getTrip(id)`, `putTrip(trip)` (optimistic version check), `createTrip(input)`. Backend chosen at runtime:
Upstash/Vercel KV if its env var names exist, else Vercel Blob if `BLOB_READ_WRITE_TOKEN`, else in-memory
(dev only, logged loudly). `docs/BOOTSTRAP.md` says which one the bootstrap agent provisioned.

## API (UI agent)

- `POST /api/trip` create; `GET /api/trip/:id`; `POST /api/trip/:id/action` with
  `{type: "accept_route"|"accept_reroute"|"propose_reroute"|"watch"|"note"|"report", role, payload}`.
  Server enforces role (companion cannot accept; rider cannot propose). Returns the new trip.
- `GET /api/trip/:id/stream` SSE: emits the trip on change (poll store every 2s, 5 min max lifetime).
- Live feed endpoints exist already: `GET /api/live`, `GET /api/live/stream` (live agent).

## Routing (`src/lib/route/`, routing agent)

Graph from `data/equipment.json` (MTA equipment master): nodes = ADA stations (any station complex with
at least one active ADA elevator), edges from `nextadanorth` / `nextadasouth` per line ("117, L" style),
plus transfer edges within a station complex. `findRoutes(from, to, constraints, index, live)` returns up
to 3 routes with legs, the elevators each route depends on (street-to-mezzanine, mezzanine-to-platform,
per direction, from the equipment master's `serving` text and `redundant` flag), risk score = f(min
elevator availability, count of "unreliable" tier, current outages, redundancy), and `broken = true`
when a required non-redundant elevator is currently out. Deterministic; unit tested with 3 known pairs.

## UI (`src/app`, `src/components`, UI agent)

Two-column page at `/t/[tripId]`: left = trip (from/to, constraints, candidate routes as route strips
with elevator chips coloured by tier, accepted route, proposals with accept/reject for rider only),
right = live panel (current outages on this route, watch list, timeline, and a "WebMCP: native/polyfill"
badge plus a list of the tools registered in THIS session so the two windows visibly differ even before
DevTools is opened). Home `/` = create trip form (also a declarative WebMCP form) and a station picker.
No map. Real data only. Design: transit-signage feel, high contrast, large type, no gradients, no
generic hero. Colour carries the tier (reliable / watch / unreliable / out).

## Ownership

| Path | Agent |
|---|---|
| scripts/, data/, src/lib/index/ | data agent (running) |
| src/lib/live/, src/app/api/live/ | live agent (running) |
| src/lib/route/ | routing agent |
| src/lib/webmcp/, src/components/webmcp/, evals/ | tools agent |
| src/lib/types.ts, src/lib/store/, src/app/** (except api/live), src/components/** (except webmcp) | UI agent |
| README.md, docs/ | orchestrator, after freeze |

Never edit another agent's path. If you need something from another path, write the interface you need
in your own path and say so in your report. Commit after every working step, small messages, no secrets.

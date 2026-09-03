/**
 * The interface the WebMCP tool layer needs from the rest of the app.
 *
 * `src/lib/types.ts` (UI agent) is the canonical home for the domain types. Until it lands,
 * they are declared here verbatim from docs/BUILD-SPEC.md "Shared types" so this layer
 * compiles and tests on its own. When types.ts exists, replace the block below with
 * `export type { ... } from "@/lib/types";` and nothing else in this file changes.
 */

export type Role = "rider" | "companion";

export type Constraints = {
  wheelchair: boolean;
  stroller?: boolean;
  avoidEscalators: boolean;
  maxTransfers: number;
};

export type Tier = "reliable" | "watch" | "unreliable" | "unknown";

export type SourceRef = { dataset: string; query: string; rows: number };

export type ElevatorRef = {
  code: string;
  station: string;
  serving: string;
  tier: Tier;
  availability24m?: number;
  unscheduled24m?: number;
  entrapments24m?: number;
  currentlyOut: boolean;
  estimatedReturn?: string;
  source?: SourceRef;
};

export type RouteLeg = {
  line: string;
  fromStop: string;
  fromName: string;
  toStop: string;
  toName: string;
  stops: number;
};

export type Route = {
  id: string;
  legs: RouteLeg[];
  transfers: number;
  elevators: ElevatorRef[];
  riskScore: number;
  riskLabel: string;
  broken: boolean;
  explanation: string;
};

export type Proposal = {
  id: string;
  by: Role;
  route: Route;
  reason: string;
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
};

export type TimelineEvent = {
  at: string;
  by: Role | "system" | "agent";
  kind: string;
  text: string;
};

export type TripReport = { id: string; equipment: string; description: string; at: string };

export type Trip = {
  id: string;
  createdAt: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  constraints: Constraints;
  candidates: Route[];
  acceptedRouteId?: string;
  proposals: Proposal[];
  watch: string[];
  notes: TimelineEvent[];
  reports: TripReport[];
  version: number;
};

export type CreateTripInput = {
  from: string;
  to: string;
  constraints: Constraints;
};

/** One row of the live MTA elevator/escalator outage feed. */
export type Outage = {
  equipment: string;
  station: string;
  line?: string;
  serving?: string;
  reason?: string;
  outageType?: string;
  ada?: boolean;
  outageDate?: string;
  estimatedReturn?: string;
};

export type StationSummary = {
  complexId: string;
  name: string;
  lines: string[];
  stopIds?: string[];
  elevatorCount: number;
  worstTier: Tier;
  outNow?: number;
};

/**
 * Provenance carried by every read. `source` names the dataset + the exact query that
 * produced the rows; `fetchedAt` is present whenever the row came from the live feed.
 */
export type Sourced<T> = T & { source?: SourceRef; fetchedAt?: string };

/**
 * Data readers. The UI agent's `useTrip()` exposes these over `/api/stations` and `/api/live`;
 * `defaultReaders()` in ./readers.ts is a drop-in implementation against those two endpoints.
 */
export interface TripReaders {
  listStations(input: {
    query?: string;
    line?: string;
    limit?: number;
  }): Promise<Sourced<{ stations: StationSummary[] }>>;

  stationStatus(input: {
    station: string;
  }): Promise<Sourced<{ station: StationSummary; elevators: ElevatorRef[]; outages: Outage[] }>>;

  elevatorHistory(input: {
    equipment: string;
  }): Promise<Sourced<{ equipment: ElevatorRef; currentlyOut: boolean; estimatedReturn?: string }>>;

  currentOutages(input: {
    station?: string;
    line?: string;
    adaOnly?: boolean;
  }): Promise<Sourced<{ outages: Outage[] }>>;
}

/**
 * Mutations plus routing, exactly the `actions` object from the UI agent's
 * `useTrip() -> { trip, role, actions }`. Every one of these is server-authoritative:
 * the server re-checks the role, so a hidden tool is never the only thing standing
 * between a companion and an accept.
 */
export interface TripActions {
  createTrip(input: CreateTripInput): Promise<Trip>;
  acceptRoute(routeId: string): Promise<Trip>;
  acceptReroute(proposalId: string): Promise<Trip>;
  proposeReroute(route: Route, reason: string): Promise<Trip>;
  watch(codes: string[]): Promise<Trip>;
  addNote(text: string): Promise<Trip>;
  report(equipment: string, description: string): Promise<Trip>;
  findRoutes(from: string, to: string, constraints: Constraints): Promise<Sourced<{ routes: Route[] }>>;
}

/** JSON Schema (draft 2020-12 subset) as accepted by `document.modelContext.registerTool`. */
export type JsonSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
};

/** WebMCP has exactly two annotations. There is no destructiveHint; see docs/WEBMCP.md. */
export type ToolAnnotations = { readOnlyHint: boolean; untrustedContentHint: boolean };

export type ToolExecuteOptions = { signal?: AbortSignal };

export type WebMcpToolDef = {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: ToolAnnotations;
  /**
   * Native Chrome passes `{ signal }` per spec; `@mcp-b/webmcp-polyfill` calls
   * `execute(args)` with one argument, so `options` must be treated as optional.
   */
  execute: (input: Record<string, unknown>, options?: ToolExecuteOptions) => Promise<unknown>;
  /**
   * "form" means this tool is registered by the browser from a `<form toolname=...>`,
   * not by registerTool. WebMCPTools skips these so the two never collide on name.
   */
  declarative?: "form";
};

/**
 * The interface the WebMCP tool layer needs from the rest of the app.
 *
 * Domain types come from `src/lib/types.ts` (UI agent, canonical). This file adds only what is
 * specific to the tool layer: provenance wrappers, the reader/action interfaces the tools call,
 * and the WebMCP tool descriptor shape.
 */
import type { StationSummary as IndexStation } from "@/lib/types";

export type {
  Role,
  Constraints,
  Tier,
  SourceRef,
  ElevatorRef,
  RouteLeg,
  Route,
  Proposal,
  TimelineEvent,
  TripReport,
  Trip,
  CreateTripInput,
} from "@/lib/types";

import type { Constraints, Route, SourceRef, Trip, CreateTripInput, ElevatorRef } from "@/lib/types";

/**
 * The tool-facing projection of one live outage row. `LiveOutage` in @/lib/types is the full
 * feed row; a model does not need eleven fields to answer "is this elevator out", and Chrome's
 * guidance is to return the minimum a model needs (1.5K chars per tool output).
 */
export type Outage = {
  equipment: string;
  station: string;
  line?: string;
  serving?: string;
  reason?: string;
  ada?: boolean;
  outageDate?: string;
  estimatedReturn?: string | null;
  upcoming?: boolean;
  /** Forced out by the shared `?demo=1` control, not the MTA feed. */
  simulated?: boolean;
};

/** What `/api/stations` puts on the wire: the index row plus the tool-layer aliases. */
export type StationSummary = IndexStation & {
  complexId: string;
  stopIds: string[];
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
    includeUpcoming?: boolean;
  }): Promise<Sourced<{ outages: Outage[] }>>;
}

/**
 * Mutations plus routing, exactly the `actions` object from the UI agent's
 * `useTrip() -> { trip, role, actions }`. Every one of these is server-authoritative:
 * the server re-checks the role, so a hidden tool is never the only thing standing
 * between a companion and an accept.
 */
export interface TripActions {
  createTrip(input: CreateTripInput): Promise<Trip & { riderUrl: string; companionUrl: string }>;
  acceptRoute(routeId: string): Promise<Trip>;
  acceptReroute(proposalId: string): Promise<Trip>;
  rejectReroute(proposalId: string): Promise<Trip>;
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

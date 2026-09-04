export type Role = "rider" | "companion";

export type Constraints = {
  wheelchair: boolean;
  stroller?: boolean;
  avoidEscalators: boolean;
  maxTransfers: number;
};

export type Tier = "reliable" | "watch" | "unreliable" | "unknown";

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
  source?: { dataset: string; query: string; rows: number };
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

export type TripReport = {
  id: string;
  equipment: string;
  description: string;
  at: string;
};

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
  /**
   * Per-link capability tokens minted at creation. `role` is derived from which of
   * these a caller presents; it is never trusted as a self-declared label. Stripped
   * from every serialised trip (GET, SSE, tool results) except the one-time POST
   * /api/trip response, which hands both to the creator.
   */
  riderKey: string;
  companionKey: string;
  /** Equipment codes forced out by the shared `?demo=1` control. Shared across both windows. */
  simulatedOut: string[];
  version: number;
};

export type TripActionType =
  | "accept_route"
  | "accept_reroute"
  | "propose_reroute"
  | "watch"
  | "note"
  | "report"
  | "simulate";

export type TripAction = {
  type: TripActionType;
  /** The capability token from the caller's link. Role is derived from this, never trusted as a label. */
  key: string;
  payload?: Record<string, unknown>;
};

export type CreateTripInput = {
  from: string;
  to: string;
  constraints: Constraints;
};

export type StationSummary = {
  id: string;
  name: string;
  /** `name`, unless that bare name is shared by more than one complex, in which case
   * `"${name} (${lines.join(" ")})"` - e.g. two complexes are both "34 St-Penn Station",
   * so each gets a `displayName` that names the lines it actually serves. Always safe to
   * render in place of `name` when a rider or an agent needs to tell two complexes apart. */
  displayName: string;
  gtfsStopIds: string[];
  lines: string[];
  elevatorCount: number;
  worstTier: Tier;
  ada: boolean;
  borough?: string;
};

export type LiveOutage = {
  equipmentCode: string;
  equipmentType: string;
  station: string;
  borough?: string;
  lines: string[];
  serving: string;
  ada: boolean;
  outageStart: string;
  estimatedReturn: string | null;
  reason: string;
  isUpcoming: boolean;
  isMaintenance: boolean;
  isCurrent: boolean;
  hoursOut: number;
  gtfsStopId?: string | null;
  stationComplexId?: string | null;
  redundant?: boolean;
  /** Set only by the ?demo=1 control. Never persisted, never in the index. */
  simulated?: boolean;
};

export type LiveSnapshot = {
  fetchedAt: string;
  sourceUrl: string;
  stale: boolean;
  coverage: number;
  counts: {
    current: number;
    upcoming: number;
    elevators: number;
    escalators: number;
    adaCurrent: number;
  };
  outages: LiveOutage[];
};

export type SourceRef = { dataset: string; query: string; rows: number };

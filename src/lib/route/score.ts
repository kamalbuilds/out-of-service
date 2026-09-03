import type { ElevatorRef, Route, Tier } from "../types";
import type { ElevatorDependency } from "./elevators";

/**
 * What `src/lib/index/` must expose for scoring. Written here because the routing
 * module only consumes it. `getEquipment` may return the raw `data/index.json` row.
 */
export interface RouteIndex {
  getEquipment(code: string): unknown;
}

export type LiveOutageLike = {
  equipment?: string;
  equipmentno?: string;
  code?: string;
  estimatedReturn?: string;
  estimatedreturntoservice?: string;
  reason?: string;
};

export type ScoredRoute = Pick<Route, "elevators" | "riskScore" | "riskLabel" | "broken" | "explanation">;

const TIER_WEIGHT: Record<Tier, number> = { unreliable: 25, watch: 10, unknown: 8, reliable: 2 };
const TRANSFER_WEIGHT = 15;
const BROKEN_WEIGHT = 60;

export function normalizeTier(raw: unknown): Tier {
  const s = String(raw ?? "").toLowerCase();
  if (s.startsWith("unreliable")) return "unreliable";
  if (s.startsWith("watch")) return "watch";
  if (s.startsWith("reliable")) return "reliable";
  return "unknown";
}

function num(...vals: unknown[]): number | undefined {
  for (const v of vals) if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

type IndexFacts = {
  tier: Tier;
  availability24m?: number;
  unscheduled24m?: number;
  entrapments24m?: number;
  source?: { dataset: string; query: string; rows: number };
};

/** Tolerates both the flat `data/index.json` row and a `{ metrics: {...} }` wrapper. */
export function readIndexEntry(entry: unknown): IndexFacts {
  if (!entry || typeof entry !== "object") return { tier: "unknown" };
  const e = entry as Record<string, unknown>;
  const m = (e.metrics && typeof e.metrics === "object" ? e.metrics : {}) as Record<string, unknown>;
  const source = (m.source ?? e.source) as IndexFacts["source"] | undefined;
  return {
    tier: normalizeTier(e.tier ?? m.tier),
    availability24m: num(m.availability_24h_mean_24m, m.availability24m, e.availability24m),
    unscheduled24m: num(m.unscheduled_24m, m.unscheduled24m, e.unscheduled24m),
    entrapments24m: num(m.entrapments_24m, m.entrapments24m, e.entrapments24m),
    source: source && typeof source === "object" ? source : undefined,
  };
}

export function outageCode(o: LiveOutageLike): string {
  return String(o.equipment ?? o.equipmentno ?? o.code ?? "").trim().toUpperCase();
}

export type ScoreInput = {
  legs: Array<{ line: string; fromName: string; toName: string }>;
  transfers: number;
  dependencies: ElevatorDependency[];
  avoidEscalators?: boolean;
};

/**
 * riskScore, 0-100.
 *   per dependent elevator: unreliable 25, watch 10, unknown 8, reliable 2
 *     (full weight for `role: "required"`, half for `role: "possible"`, since a
 *      "possible" elevator has a sibling that can carry the same move)
 *   + 15 per transfer
 *   + 60 and broken=true if a required, non-redundant elevator is out right now
 */
export function scoreRoute(route: ScoreInput, index: RouteIndex | undefined, live: LiveOutageLike[] = []): ScoredRoute {
  const outages = new Map<string, LiveOutageLike>();
  for (const o of live) {
    const c = outageCode(o);
    if (c) outages.set(c, o);
  }

  const elevators: ElevatorRef[] = [];
  let score = 0;
  let broken = false;
  const brokenCodes: string[] = [];

  for (const dep of route.dependencies) {
    const facts = readIndexEntry(index?.getEquipment(dep.code));
    const outage = outages.get(dep.code.toUpperCase());
    const currentlyOut = Boolean(outage);

    elevators.push({
      code: dep.code,
      station: dep.atName,
      serving: dep.serving || dep.shortDescription,
      tier: facts.tier,
      availability24m: facts.availability24m,
      unscheduled24m: facts.unscheduled24m,
      entrapments24m: facts.entrapments24m,
      currentlyOut,
      estimatedReturn: outage?.estimatedReturn ?? outage?.estimatedreturntoservice,
      source: facts.source,
    });

    const weight = TIER_WEIGHT[facts.tier];
    score += dep.role === "required" ? weight : weight / 2;

    if (currentlyOut && dep.role === "required" && !dep.redundant) {
      broken = true;
      brokenCodes.push(dep.code);
    }
  }

  score += TRANSFER_WEIGHT * route.transfers;
  if (broken) score += BROKEN_WEIGHT;
  const riskScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    elevators,
    riskScore,
    riskLabel: labelFor(riskScore),
    broken,
    explanation: explain(route, elevators, riskScore, broken, brokenCodes),
  };
}

export function labelFor(score: number): string {
  if (score < 20) return "low risk";
  if (score < 45) return "moderate";
  if (score < 70) return "high";
  return "avoid";
}

const TIER_ORDER: Record<Tier, number> = { unreliable: 0, watch: 1, unknown: 2, reliable: 3 };

function weakest(elevators: ElevatorRef[]): ElevatorRef | undefined {
  return [...elevators].sort(
    (a, b) =>
      Number(b.currentlyOut) - Number(a.currentlyOut) ||
      TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
      (a.availability24m ?? 1) - (b.availability24m ?? 1) ||
      a.code.localeCompare(b.code),
  )[0];
}

function pct(v: number | undefined): string {
  return v === undefined ? "no availability history" : `${(v * 100).toFixed(1)}% available over 24 months`;
}

function explain(
  route: ScoreInput,
  elevators: ElevatorRef[],
  riskScore: number,
  broken: boolean,
  brokenCodes: string[],
): string {
  const w = weakest(elevators);
  const shape =
    route.transfers === 0
      ? `A one-seat ride on the ${route.legs.map((l) => l.line).join("/")}`
      : `${route.transfers} transfer${route.transfers === 1 ? "" : "s"} (${route.legs.map((l) => l.line).join(" then ")})`;
  const escalators = route.avoidEscalators ? " No escalators are used: every vertical move on this route is an elevator." : "";
  if (!w) return `${shape} with no elevator dependency recorded, scored ${riskScore}.${escalators}`;
  const numbers = [
    pct(w.availability24m),
    w.unscheduled24m !== undefined ? `${w.unscheduled24m} unscheduled outages` : null,
    w.entrapments24m ? `${w.entrapments24m} entrapments` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (broken) {
    return `${shape}, scored ${riskScore}: ${brokenCodes.join(" and ")} at ${w.station} is out right now${
      w.estimatedReturn ? ` (back ${w.estimatedReturn})` : ""
    }, and the weakest elevator on the route is ${w.code} (${w.tier}, ${numbers}).${escalators}`;
  }
  return `${shape}, scored ${riskScore}: the weakest elevator is ${w.code} at ${w.station}, ${w.tier}, ${numbers}.${escalators}`;
}

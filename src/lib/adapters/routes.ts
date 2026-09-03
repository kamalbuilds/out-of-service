/**
 * Bridge to the routing agent's `findRoutes`. That module lands after this
 * one, so the specifier is a template literal: the bundler builds a lazy
 * context over `src/lib/*` and the real module is picked up the moment it
 * exists. Until then every caller gets one sentence saying exactly what is
 * missing instead of a module-resolution stack trace.
 */
import type { Constraints, ElevatorRef, LiveSnapshot, Route, RouteLeg, Tier } from "@/lib/types";

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asTier(v: unknown): Tier {
  const s = str(v);
  if (s === "reliable" || s === "watch") return s;
  if (s.startsWith("unreliable")) return "unreliable";
  return "unknown";
}

function normaliseElevator(raw: Record<string, unknown>): ElevatorRef {
  return {
    code: str(raw.code ?? raw.equipment_code ?? raw.equipment),
    station: str(raw.station),
    serving: str(raw.serving ?? raw.shortdescription),
    tier: asTier(raw.tier),
    availability24m: num(raw.availability24m ?? raw.availability_24h_mean_24m),
    unscheduled24m: num(raw.unscheduled24m ?? raw.unscheduled_24m),
    entrapments24m: num(raw.entrapments24m ?? raw.entrapments_24m),
    currentlyOut: Boolean(raw.currentlyOut ?? raw.currently_out),
    estimatedReturn: str(raw.estimatedReturn ?? raw.estimated_return) || undefined,
    source: (raw.source as ElevatorRef["source"]) ?? undefined,
  };
}

function normaliseLeg(raw: Record<string, unknown>): RouteLeg {
  return {
    line: str(raw.line),
    fromStop: str(raw.fromStop ?? raw.from),
    fromName: str(raw.fromName ?? raw.from),
    toStop: str(raw.toStop ?? raw.to),
    toName: str(raw.toName ?? raw.to),
    stops: Number(raw.stops ?? 0) || 0,
  };
}

export function normaliseRoute(raw: Record<string, unknown>, i: number): Route {
  const elevators = Array.isArray(raw.elevators)
    ? (raw.elevators as Record<string, unknown>[]).map(normaliseElevator)
    : [];
  const legs = Array.isArray(raw.legs)
    ? (raw.legs as Record<string, unknown>[]).map(normaliseLeg)
    : [];
  return {
    id: str(raw.id, `r${i + 1}`),
    legs,
    transfers: Number(raw.transfers ?? Math.max(0, legs.length - 1)) || 0,
    elevators,
    riskScore: Number(raw.riskScore ?? raw.risk_score ?? 0) || 0,
    riskLabel: str(raw.riskLabel ?? raw.risk_label, "unscored"),
    broken: Boolean(raw.broken),
    explanation: str(raw.explanation),
  };
}

type FindRoutesFn = (...args: unknown[]) => unknown;

let cached: Promise<FindRoutesFn> | null = null;

async function loadFindRoutes(): Promise<FindRoutesFn> {
  cached ??= (async () => {
    const name = "route";
    let mod: Record<string, unknown>;
    try {
      mod = (await import(`../${name}`)) as Record<string, unknown>;
    } catch {
      throw new Error(
        "Accessible route search is unavailable: src/lib/route does not export a module yet. " +
          "That path is owned by the routing agent and must export findRoutes(from, to, constraints, deps) " +
          "as described in docs/BUILD-SPEC.md.",
      );
    }
    for (const key of ["findRoutes", "routeAccessible"]) {
      if (typeof mod[key] === "function") return mod[key] as FindRoutesFn;
    }
    const exported = Object.keys(mod).filter((k) => typeof mod[k] === "function");
    throw new Error(
      `src/lib/route exports no findRoutes(). It exports: [${exported.join(", ") || "nothing callable"}].`,
    );
  })();
  return cached;
}

export async function findRoutes(
  fromStop: string,
  toStop: string,
  constraints: Constraints,
  live: LiveSnapshot,
): Promise<Route[]> {
  const fn = await loadFindRoutes();
  const deps = { live, outages: live.outages, fetchedAt: live.fetchedAt };

  let out: unknown;
  try {
    out = await fn(fromStop, toStop, constraints, deps);
  } catch (err) {
    // Older shape from the spec: (from, to, constraints, index, live)
    try {
      out = await fn(fromStop, toStop, constraints, undefined, live);
    } catch {
      throw err;
    }
  }

  const rows = Array.isArray(out)
    ? out
    : Array.isArray((out as { routes?: unknown[] })?.routes)
      ? (out as { routes: unknown[] }).routes
      : [];
  return (rows as Record<string, unknown>[]).map(normaliseRoute).slice(0, 3);
}

export async function routingAvailable(): Promise<boolean> {
  try {
    await loadFindRoutes();
    return true;
  } catch {
    return false;
  }
}

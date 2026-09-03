/**
 * Bridge to the routing agent's `findRoutes`. It already returns
 * `src/lib/types` `Route` objects, so the only work here is the outage shape:
 * `src/lib/route/score` keys an outage off `equipment | equipmentno | code`,
 * while the live feed calls that field `equipmentCode`. Passing the feed rows
 * straight through would give every outage an empty code and no route would
 * ever be marked broken.
 *
 * Only outages that have already started are passed: an upcoming maintenance
 * window is not a broken route today.
 */
import { findRoutes as rawFindRoutes, type RouteSearchResult } from "@/lib/route";
import type { LiveOutageLike } from "@/lib/route";
import type { Constraints, LiveSnapshot, Route } from "@/lib/types";

export function toRoutingOutages(live: LiveSnapshot): LiveOutageLike[] {
  return live.outages
    .filter((o) => o.isCurrent)
    .map((o) => ({
      equipment: o.equipmentCode,
      estimatedReturn: o.estimatedReturn ?? undefined,
      reason: o.reason,
    }));
}

export function findRoutes(
  fromStop: string,
  toStop: string,
  constraints: Constraints,
  live: LiveSnapshot,
): RouteSearchResult & { routes: Route[] } {
  const outages = toRoutingOutages(live);
  const result = rawFindRoutes(fromStop, toStop, constraints, { outages });
  return { ...result, routes: result.routes.slice(0, 3) };
}

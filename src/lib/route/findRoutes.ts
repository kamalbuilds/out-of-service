import type { Constraints, Route, RouteLeg } from "../types";
import { routeElevators, type ElevatorDependency, type LegPlan } from "./elevators";
import { Direction, getGraph, resolveNode, StationGraph, StationNode } from "./graph";
import { EQUIPMENT_SOURCE } from "./equipment";
import { scoreRoute, type LiveOutageLike, type RouteIndex } from "./score";
import { defaultIndex } from "./defaultIndex";

const TRANSFER_COST = 4;
/** How many times one (station, line) state may be settled. Higher = more alternatives, slower. */
const K_PER_STATE = 6;
const MAX_CANDIDATES = 24;

/**
 * `index` defaults to `src/lib/index` (the reliability index). `live` accepts the
 * raw outage array, a `LiveSnapshot` (`{ outages: [...] }`), or `deps.outages`,
 * because the API adapter and the WebMCP tools pass different shapes.
 */
export type FindRoutesDeps = {
  graph?: StationGraph;
  index?: RouteIndex;
  live?: LiveOutageLike[] | { outages?: LiveOutageLike[] } | null;
  outages?: LiveOutageLike[] | null;
};

function toOutages(deps: FindRoutesDeps): LiveOutageLike[] {
  if (Array.isArray(deps.outages)) return deps.outages;
  if (Array.isArray(deps.live)) return deps.live;
  const nested = deps.live && typeof deps.live === "object" ? (deps.live as { outages?: LiveOutageLike[] }).outages : null;
  return Array.isArray(nested) ? nested : [];
}

export type RouteSearchResult = {
  from?: { id: string; name: string; lines: string[] };
  to?: { id: string; name: string; lines: string[] };
  routes: Route[];
  notes: string[];
  source: { dataset: string; query: string; rows: number };
};

type SearchState = {
  node: string;
  line: string;
  stops: number;
  transfers: number;
  cost: number;
  legs: LegPlan[];
  /** every complex already touched, so a route never doubles back through a station */
  path: string[];
};

export function findRoutes(
  fromStop: string,
  toStop: string,
  constraints: Partial<Constraints> = {},
  deps: FindRoutesDeps = {},
): RouteSearchResult {
  const graph = deps.graph ?? getGraph();
  const index = deps.index ?? defaultIndex();
  const live = toOutages(deps);
  const maxTransfers = Number.isFinite(constraints.maxTransfers) ? Math.max(0, Number(constraints.maxTransfers)) : 3;
  const notes: string[] = [];
  const source = {
    dataset: "nyct_ene_equipments",
    query: EQUIPMENT_SOURCE,
    rows: graph.stats.adaElevatorRows,
  };

  const from = resolveNode(graph, fromStop);
  const to = resolveNode(graph, toStop);
  if (!from) return { routes: [], notes: [`No accessible station matches "${fromStop}".`], source };
  if (!to) return { routes: [], notes: [`No accessible station matches "${toStop}".`], source, from: brief(from) };
  if (from.id === to.id) {
    return {
      from: brief(from),
      to: brief(to),
      routes: [],
      notes: [`${from.name} is both the origin and the destination.`],
      source,
    };
  }

  const raw = search(graph, from.id, to.id, maxTransfers);
  if (raw.length === 0) {
    notes.push(
      `No elevator-accessible path from ${from.name} to ${to.name} within ${maxTransfers} transfer${
        maxTransfers === 1 ? "" : "s"
      }. The MTA equipment master only records next-ADA-station links between stations that both have active ADA elevators.`,
    );
    return { from: brief(from), to: brief(to), routes: [], notes, source };
  }

  if (constraints.avoidEscalators) {
    notes.push("avoidEscalators is already satisfied: this graph is built from ADA elevators only, no escalator is ever part of a route.");
  }

  const scored = raw.map((s) => {
    const dependencies = routeElevators(s.legs, graph);
    const result = scoreRoute(
      { legs: s.legs, transfers: s.transfers, dependencies, avoidEscalators: Boolean(constraints.avoidEscalators) },
      index,
      live,
    );
    const legs: RouteLeg[] = s.legs.map(({ direction: _direction, ...leg }) => leg);
    const route: Route = {
      id: routeId(s.legs),
      legs,
      transfers: s.transfers,
      ...result,
    };
    return { route, stops: s.stops, dependencies };
  });

  scored.sort(
    (a, b) =>
      a.route.riskScore - b.route.riskScore ||
      a.stops - b.stops ||
      a.route.transfers - b.route.transfers ||
      a.route.id.localeCompare(b.route.id),
  );

  const picked: Route[] = [];
  const seenShape = new Set<string>();
  for (const s of scored) {
    const shape = s.route.legs.map((l) => `${l.line}:${l.toStop}`).join(">");
    if (seenShape.has(shape)) continue;
    seenShape.add(shape);
    picked.push(s.route);
    if (picked.length === 3) break;
  }

  return { from: brief(from), to: brief(to), routes: picked, notes, source };
}

function brief(n: StationNode) {
  return { id: n.id, name: n.name, lines: [...n.lines] };
}

/** Elevator dependencies for one already-found route, for tools that need the detail. */
export function explainRoute(route: Route, graph: StationGraph = getGraph()): ElevatorDependency[] {
  const legs: LegPlan[] = route.legs.map((l) => ({ ...l, direction: legDirection(graph, l) }));
  return routeElevators(legs, graph);
}

function legDirection(graph: StationGraph, leg: RouteLeg): Direction {
  const edges = graph.adjacency.get(leg.fromStop)?.get(leg.line) ?? [];
  return edges.find((e) => e.to === leg.toStop)?.direction ?? "north";
}

/**
 * k-shortest search over (station, line) states. Cost is stops + 4 per transfer,
 * so a transfer has to save four ADA stops to be worth taking. Each state may be
 * settled K_PER_STATE times, which is what produces genuinely different candidates
 * instead of one path plus near-duplicates.
 */
function search(graph: StationGraph, fromId: string, toId: string, maxTransfers: number): SearchState[] {
  const start = graph.nodes.get(fromId);
  if (!start) return [];
  const queue: SearchState[] = [];
  const settled = new Map<string, number>();
  const found: SearchState[] = [];

  for (const line of start.lines) {
    queue.push({ node: fromId, line, stops: 0, transfers: 0, cost: 0, legs: [], path: [fromId] });
  }

  while (queue.length > 0) {
    // small graph (123 nodes), a linear extract-min keeps this dependency-free and deterministic
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i];
      const b = queue[best];
      if (a.cost < b.cost || (a.cost === b.cost && (a.transfers < b.transfers || (a.transfers === b.transfers && a.line < b.line)))) {
        best = i;
      }
    }
    const cur = queue.splice(best, 1)[0];

    const key = `${cur.node}|${cur.line}`;
    const seen = settled.get(key) ?? 0;
    if (seen >= K_PER_STATE) continue;
    settled.set(key, seen + 1);

    if (cur.node === toId && cur.legs.length > 0) {
      found.push(cur);
      if (found.length >= MAX_CANDIDATES) break;
      continue;
    }

    for (const edge of graph.adjacency.get(cur.node)?.get(cur.line) ?? []) {
      if (cur.path.includes(edge.to)) continue; // no revisits
      const last = cur.legs[cur.legs.length - 1];
      const legs =
        last && last.line === cur.line && last.toStop === cur.node && last.direction === edge.direction
          ? [
              ...cur.legs.slice(0, -1),
              { ...last, toStop: edge.to, toName: nameOf(graph, edge.to), stops: last.stops + 1 },
            ]
          : [
              ...cur.legs,
              {
                line: cur.line,
                fromStop: cur.node,
                fromName: nameOf(graph, cur.node),
                toStop: edge.to,
                toName: nameOf(graph, edge.to),
                stops: 1,
                direction: edge.direction,
              },
            ];
      queue.push({
        node: edge.to,
        line: cur.line,
        stops: cur.stops + 1,
        transfers: cur.transfers,
        cost: cur.cost + 1,
        legs,
        path: [...cur.path, edge.to],
      });
    }

    if (cur.transfers < maxTransfers && cur.legs.length > 0 && cur.node !== toId) {
      const node = graph.nodes.get(cur.node);
      for (const line of node?.lines ?? []) {
        if (line === cur.line) continue;
        queue.push({
          node: cur.node,
          line,
          stops: cur.stops,
          transfers: cur.transfers + 1,
          cost: cur.cost + TRANSFER_COST,
          legs: cur.legs,
          path: cur.path,
        });
      }
    }
  }

  return found;
}

function nameOf(graph: StationGraph, id: string): string {
  return graph.nodes.get(id)?.name ?? id;
}

/** FNV-1a over the leg sequence: same legs always produce the same route id. */
export function routeId(legs: Array<{ line: string; fromStop: string; toStop: string }>): string {
  const s = legs.map((l) => `${l.line}:${l.fromStop}>${l.toStop}`).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `r_${h.toString(16).padStart(8, "0")}`;
}

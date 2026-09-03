import { describe, expect, it } from "vitest";
import { buildGraph, getGraph, listNodes, parseNextAda, resolveNode } from "./graph";
import { findRoutes, explainRoute, legDirection } from "./findRoutes";
import { routeElevators } from "./elevators";
import { scoreRoute, type LiveOutageLike } from "./score";
import { defaultIndex } from "./defaultIndex";
import type { Route } from "../types";

const graph = getGraph();

describe("graph", () => {
  it("prints its shape and holds every ADA station complex", () => {
    // eslint-disable-next-line no-console
    console.log("[graph]", JSON.stringify(graph.stats));
    expect(graph.stats.nodes).toBe(123);
    expect(graph.stats.nodes).toBeGreaterThanOrEqual(100);
    expect(graph.stats.elevators).toBe(384);
    expect(graph.stats.rideEdges).toBe(558);
    expect(graph.stats.assertedRideEdges).toBe(472);
    expect(graph.stats.inferredRideEdges).toBe(86);
    expect(graph.stats.stopTransferEdges).toBe(132);
    expect(graph.stats.lines).toBe(23);
    expect(listNodes(graph)).toHaveLength(123);
  });

  it("logs every nextada value it could not turn into an edge", () => {
    const byReason = graph.unparsed.reduce<Record<string, number>>((acc, u) => {
      acc[u.reason] = (acc[u.reason] ?? 0) + 1;
      return acc;
    }, {});
    // eslint-disable-next-line no-console
    console.log("[graph] unparsed", JSON.stringify(byReason), [...new Set(graph.unparsed.map((u) => `${u.raw} @${u.station} (${u.reason})`))].join("; "));
    // no value in the master is syntactically malformed: every failure is a target
    // MRN with no active ADA elevator, or a station pointing at itself
    expect(byReason.malformed ?? 0).toBe(0);
    expect(graph.unparsed).toHaveLength(46);
  });

  it("parses every nextada string format present in the master", () => {
    expect(parseNextAda("117, L").targets).toEqual([{ mrn: "117", line: "L" }]);
    expect(parseNextAda("215, B, D").targets).toEqual([
      { mrn: "215", line: "B" },
      { mrn: "215", line: "D" },
    ]);
    expect(parseNextAda("215, B, D / 387, 4").targets).toEqual([
      { mrn: "215", line: "B" },
      { mrn: "215", line: "D" },
      { mrn: "387", line: "4" },
    ]);
    expect(parseNextAda("").targets).toEqual([]);
    expect(parseNextAda(null).targets).toEqual([]);
    // the index builder's normalised object form
    expect(parseNextAda({ stopId: "117", line: "L" }).targets).toEqual([{ mrn: "117", line: "L" }]);
  });

  it("resolves a station by complex id, MRN, GTFS stop id and name", () => {
    expect(resolveNode(graph, "616")?.id).toBe("616");
    expect(resolveNode(graph, "G14")?.id).toBe("616"); // GTFS stop
    expect(resolveNode(graph, "Jackson Hts-Roosevelt Av")?.id).toBe("616");
    expect(resolveNode(graph, "Jay St-MetroTech")?.id).toBe("636");
    expect(resolveNode(graph, "nowhere at all")).toBeUndefined();
  });

  it("builds identically twice (deterministic)", () => {
    const a = buildGraph();
    expect(a.stats).toEqual(graph.stats);
    expect(a.rideEdges.map((e) => `${e.from}${e.to}${e.line}${e.direction}`)).toEqual(
      graph.rideEdges.map((e) => `${e.from}${e.to}${e.line}${e.direction}`),
    );
  });
});

function legsAreChained(route: Route) {
  for (let i = 0; i + 1 < route.legs.length; i++) {
    expect(route.legs[i].toStop).toBe(route.legs[i + 1].fromStop);
    expect(route.legs[i].toName).toBe(route.legs[i + 1].fromName);
  }
  expect(route.transfers).toBe(Math.max(0, route.legs.length - 1));
}

/**
 * `topLines` is what the best route may legitimately be built from. Alternates are
 * not pinned to a list, because the tiers in `data/index.json` are rebuilt from live
 * MTA history and a re-tiering legitimately promotes a different alternate. Every
 * route is instead held to structural invariants that no re-tiering can satisfy by
 * accident: the legs chain, each leg's line is served at both ends, and no candidate
 * is a detour.
 */
const PAIRS: Array<{ from: string; to: string; topLines: string[] }> = [
  // Jackson Hts is E/F/M/R/7; the one-seat rides into the Times Sq complex are E, R and 7
  { from: "Jackson Hts-Roosevelt Av", to: "Times Sq-42 St", topLines: ["E", "R", "7"] },
  // the 4 runs Jerome Av straight to Grand Central; B/D to 125 St and across is the alternate
  { from: "161 St-Yankee Stadium", to: "Grand Central-42 St", topLines: ["4", "5", "6", "B", "D"] },
  // the R is the only one-seat ride between these two complexes
  { from: "Atlantic Av-Barclays Ctr", to: "Jay St-MetroTech", topLines: ["R"] },
];

/** The line of every leg must actually be served at both ends of that leg. */
function lineIsServedEndToEnd(route: Route) {
  for (const leg of route.legs) {
    expect(graph.nodes.get(leg.fromStop)?.lines, `${leg.line} at ${leg.fromName}`).toContain(leg.line);
    expect(graph.nodes.get(leg.toStop)?.lines, `${leg.line} at ${leg.toName}`).toContain(leg.line);
    // and the leg must be walkable along that line in one direction
    expect(() => legDirection(graph, leg)).not.toThrow();
  }
}

describe("findRoutes", () => {
  for (const pair of PAIRS) {
    it(`routes ${pair.from} -> ${pair.to}`, () => {
      const res = findRoutes(pair.from, pair.to, { wheelchair: true, avoidEscalators: false, maxTransfers: 2 });
      expect(res.from).toBeDefined();
      expect(res.to).toBeDefined();
      expect(res.routes.length).toBeGreaterThan(0);
      expect(res.routes.length).toBeLessThanOrEqual(3);

      // eslint-disable-next-line no-console
      console.log(
        `[route] ${res.from!.name} -> ${res.to!.name}\n` +
          res.routes
            .map(
              (r) =>
                `  ${r.id} risk=${r.riskScore} ${r.riskLabel} transfers=${r.transfers} elevators=${r.elevators.length}\n` +
                `    ${r.legs.map((l) => `${l.line} ${l.fromName} -> ${l.toName} (${l.stops})`).join(" | ")}`,
            )
            .join("\n"),
      );

      for (const r of res.routes) {
        legsAreChained(r);
        expect(r.legs.length).toBeGreaterThan(0);
        expect(r.legs[0].fromStop).toBe(res.from!.id);
        expect(r.legs[r.legs.length - 1].toStop).toBe(res.to!.id);
        expect(r.transfers).toBeLessThanOrEqual(2);
        expect(r.elevators.length).toBeGreaterThan(0);
        expect(r.riskScore).toBeGreaterThanOrEqual(0);
        expect(r.riskScore).toBeLessThanOrEqual(100);
        expect(r.explanation.length).toBeGreaterThan(20);
        lineIsServedEndToEnd(r);
      }
      // the best route is the one the pair is chosen for, and it is pinned
      for (const l of res.routes[0].legs) expect(pair.topLines).toContain(l.line);

      /**
       * No candidate may be a joyride. This is the check that caught "Atlantic Av
       * -> Coney Island -> Jay St": 6 accessible stops against a shortest of 2,
       * which scored below the direct R purely on elevator tiers.
       */
      const stopsOf = (r: Route) => r.legs.reduce((n, l) => n + l.stops, 0);
      const shortest = Math.min(...res.routes.map(stopsOf));
      for (const r of res.routes) {
        expect(stopsOf(r), `${r.id} detours`).toBeLessThanOrEqual(Math.max(shortest + 2, shortest * 2));
      }
      // ids are distinct and stable
      expect(new Set(res.routes.map((r) => r.id)).size).toBe(res.routes.length);
      const again = findRoutes(pair.from, pair.to, { wheelchair: true, avoidEscalators: false, maxTransfers: 2 });
      expect(again.routes.map((r) => r.id)).toEqual(res.routes.map((r) => r.id));
    });
  }

  it("respects maxTransfers", () => {
    const res = findRoutes("161 St-Yankee Stadium", "Jay St-MetroTech", { maxTransfers: 0 });
    for (const r of res.routes) expect(r.transfers).toBe(0);
  });

  it("says so when avoidEscalators is set, and does not change the routes", () => {
    const plain = findRoutes("616", "611", { maxTransfers: 1 });
    const noEsc = findRoutes("616", "611", { maxTransfers: 1, avoidEscalators: true });
    expect(noEsc.routes.map((r) => r.id)).toEqual(plain.routes.map((r) => r.id));
    expect(noEsc.notes.join(" ")).toMatch(/elevators only/i);
    expect(noEsc.routes[0].explanation).toMatch(/No escalators/);
  });

  it("returns an actionable note, not an exception, for an unknown station", () => {
    const res = findRoutes("Hogwarts", "611", {});
    expect(res.routes).toHaveLength(0);
    expect(res.notes[0]).toMatch(/No accessible station matches/);
  });
});

describe("elevator dependencies and scoring", () => {
  it("names an origin, a transfer and a destination elevator", () => {
    const res = findRoutes("161 St-Yankee Stadium", "Jay St-MetroTech", { maxTransfers: 2 });
    const route = res.routes.find((r) => r.transfers >= 1) ?? res.routes[0];
    const deps = explainRoute(route, graph);
    // eslint-disable-next-line no-console
    console.log(
      `[elevators] ${route.legs.map((l) => l.line).join(">")}\n` +
        deps.map((d) => `  ${d.stage}/${d.role} ${d.code} @${d.atName} [${d.segment} ${d.direction}] ${d.shortDescription}`).join("\n"),
    );
    expect(deps.some((d) => d.stage === "origin")).toBe(true);
    expect(deps.some((d) => d.stage === "destination")).toBe(true);
    if (route.transfers > 0) expect(deps.some((d) => d.stage === "transfer")).toBe(true);
    expect(deps.every((d) => d.code.startsWith("EL"))).toBe(true);
  });

  /**
   * The check that can fail: the same route is scored twice, once with an empty
   * live feed and once with one required elevator marked out. If `broken` did not
   * flip and the score did not climb, the outage path is dead code.
   */
  it("flips broken and raises riskScore when a required elevator goes out", () => {
    const res = findRoutes("Times Sq-42 St", "34 St-Penn Station", { maxTransfers: 1 });
    const before = res.routes[0];
    expect(before.broken).toBe(false);

    const legs = before.legs.map((l) => ({ ...l, direction: legDirection(graph, l) }));
    const deps = routeElevators(legs, graph);
    const victim = deps.find((d) => d.role === "required" && !d.redundant);
    expect(victim, "route must depend on at least one required, non-redundant elevator").toBeDefined();

    const clean = scoreRoute({ legs, transfers: before.transfers, dependencies: deps }, defaultIndex(), []);
    const outage: LiveOutageLike[] = [{ equipment: victim!.code, estimatedReturn: "2026-09-04T22:00:00Z" }];
    const hit = scoreRoute({ legs, transfers: before.transfers, dependencies: deps }, defaultIndex(), outage);

    // eslint-disable-next-line no-console
    console.log(`[score] ${victim!.code} out: broken ${clean.broken} -> ${hit.broken}, risk ${clean.riskScore} -> ${hit.riskScore} (raw ${clean.rawScore} -> ${hit.rawScore})`);
    expect(clean.broken).toBe(false);
    expect(hit.broken).toBe(true);
    expect(hit.rawScore).toBe(clean.rawScore + 60);
    expect(hit.riskScore).toBeGreaterThan(clean.riskScore);
    expect(hit.explanation).toContain(victim!.code);
    expect(hit.explanation).toMatch(/out right now/);
    expect(hit.elevators.find((e) => e.code === victim!.code)?.currentlyOut).toBe(true);
    expect(clean.elevators.find((e) => e.code === victim!.code)?.currentlyOut).toBe(false);
  });

  it("does not break a route when the elevator that is out is redundant", () => {
    const res = findRoutes("Times Sq-42 St", "34 St-Penn Station", { maxTransfers: 1 });
    const before = res.routes[0];
    const legs = before.legs.map((l) => ({ ...l, direction: legDirection(graph, l) }));
    const deps = routeElevators(legs, graph);
    const spare = deps.find((d) => d.redundant || d.role === "possible");
    expect(spare, "the Port Authority complex has redundant elevators").toBeDefined();
    const hit = scoreRoute({ legs, transfers: before.transfers, dependencies: deps }, defaultIndex(), [
      { equipment: spare!.code },
    ]);
    expect(hit.broken).toBe(false);
    expect(hit.elevators.find((e) => e.code === spare!.code)?.currentlyOut).toBe(true);
  });

  it("reranks the candidates when the live feed puts an elevator out", () => {
    const plain = findRoutes("Times Sq-42 St", "34 St-Penn Station", { maxTransfers: 1 });
    const eLine = plain.routes.find((r) => r.legs.every((l) => l.line === "E"));
    expect(eLine, "the E is one of the one-seat rides between these two complexes").toBeDefined();

    // EL228 is the mezzanine-to-platform elevator for the E at 34 St-Penn Station
    const live: LiveOutageLike[] = [{ equipment: "EL228", estimatedReturn: "09/04/2026 10:00:00 PM" }];
    const withOutage = findRoutes("Times Sq-42 St", "34 St-Penn Station", { maxTransfers: 1 }, { live });
    // eslint-disable-next-line no-console
    console.log(
      "[rerank] without outage: " + plain.routes.map((r) => `${r.legs[0].line}=${r.riskScore}`).join(" ") +
        " | with EL228 out: " + withOutage.routes.map((r) => `${r.legs[0].line}=${r.riskScore}${r.broken ? "*" : ""}`).join(" "),
    );
    expect(withOutage.routes[0].broken).toBe(false);
    expect(withOutage.routes[0].id).not.toBe(eLine!.id);
    const eNow = withOutage.routes.find((r) => r.id === eLine!.id);
    expect(eNow?.broken).toBe(true);
    expect(eNow!.riskScore).toBeGreaterThan(eLine!.riskScore);
  });
});

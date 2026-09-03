import type { Proposal, Role, Route, TimelineEvent, Trip, TripActionType } from "@/lib/types";
import { explainRoute, scoreRoute } from "@/lib/route";
import { defaultIndex } from "@/lib/route/defaultIndex";
import { liveSnapshotOrEmpty } from "@/lib/adapters/live";
import { toRoutingOutages } from "@/lib/adapters/routes";
import { getTrip, putTrip, StaleWriteError } from "./index";

export class RoleError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "RoleError";
  }
}

export class ActionError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

const RIDER_ONLY: TripActionType[] = ["accept_route", "accept_reroute", "report", "simulate"];
const COMPANION_ONLY: TripActionType[] = ["propose_reroute"];

/**
 * `role` is never a client-supplied label. It is derived from which of the trip's
 * two capability tokens (`riderKey` / `companionKey`) the caller presented. A key
 * that matches neither is not "companion by default" — it is not authenticated at
 * all, so the caller gets no role and every gated action 403s.
 */
export function roleForKey(trip: Trip, key: string): Role | null {
  if (!key) return null;
  if (key === trip.riderKey) return "rider";
  if (key === trip.companionKey) return "companion";
  return null;
}

export function assertRole(type: TripActionType, role: Role): void {
  if (RIDER_ONLY.includes(type) && role !== "rider") {
    throw new RoleError(
      `Only the rider can ${type.replace(/_/g, " ")}. You are the companion: propose a reroute instead and the rider confirms it.`,
    );
  }
  if (COMPANION_ONLY.includes(type) && role !== "companion") {
    throw new RoleError(
      `Only the companion can ${type.replace(/_/g, " ")}. You are the rider: accept or reject the proposals you already have.`,
    );
  }
}

function event(by: Role | "system", kind: string, text: string): TimelineEvent {
  return { at: new Date().toISOString(), by, kind, text };
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

type Payload = Record<string, unknown>;

function mutate(trip: Trip, type: TripActionType, role: Role, payload: Payload): Trip {
  const next: Trip = {
    ...trip,
    candidates: [...trip.candidates],
    proposals: [...trip.proposals],
    watch: [...trip.watch],
    notes: [...trip.notes],
    reports: [...trip.reports],
    version: trip.version + 1,
  };

  switch (type) {
    case "accept_route": {
      const routeId = String(payload.routeId ?? "");
      const route = next.candidates.find((r) => r.id === routeId);
      if (!route) {
        throw new ActionError(
          `No candidate route with id "${routeId}". This trip has: ${next.candidates.map((r) => r.id).join(", ") || "none"}.`,
        );
      }
      next.acceptedRouteId = route.id;
      next.notes.push(
        event(role, "accept_route", `Rider accepted route ${route.id} (${route.riskLabel}).`),
      );
      return next;
    }

    case "propose_reroute": {
      const route = payload.route as Route | undefined;
      const routeId = String(payload.routeId ?? route?.id ?? "");
      const candidate = route ?? next.candidates.find((r) => r.id === routeId);
      if (!candidate) {
        throw new ActionError(
          `propose_reroute needs either a full route object or a routeId from this trip's candidates (${next.candidates.map((r) => r.id).join(", ") || "none"}).`,
        );
      }
      const reason = String(payload.reason ?? "").trim();
      if (!reason) throw new ActionError("propose_reroute needs a reason the rider can read.");
      const proposal: Proposal = {
        id: id("p"),
        by: "companion",
        route: candidate,
        reason,
        createdAt: new Date().toISOString(),
        status: "pending",
      };
      next.proposals.push(proposal);
      next.notes.push(
        event(role, "propose_reroute", `Companion proposed route ${candidate.id}: ${reason}`),
      );
      return next;
    }

    case "accept_reroute": {
      const proposalId = String(payload.proposalId ?? "");
      const decision = payload.decision === "reject" ? "reject" : "accept";
      const proposal = next.proposals.find((p) => p.id === proposalId);
      if (!proposal) {
        throw new ActionError(
          `No proposal with id "${proposalId}". Pending proposals: ${next.proposals.filter((p) => p.status === "pending").map((p) => p.id).join(", ") || "none"}.`,
        );
      }
      if (proposal.status !== "pending") {
        throw new ActionError(`Proposal ${proposalId} was already ${proposal.status}.`);
      }
      next.proposals = next.proposals.map((p) =>
        p.id === proposalId
          ? { ...p, status: decision === "accept" ? ("accepted" as const) : ("rejected" as const) }
          : p,
      );
      if (decision === "accept") {
        if (!next.candidates.some((c) => c.id === proposal.route.id)) {
          next.candidates = [...next.candidates, proposal.route];
        }
        next.acceptedRouteId = proposal.route.id;
        next.notes.push(
          event(role, "accept_reroute", `Rider accepted the reroute to ${proposal.route.id}.`),
        );
      } else {
        next.notes.push(
          event(role, "reject_reroute", `Rider rejected the reroute to ${proposal.route.id}.`),
        );
      }
      return next;
    }

    case "watch": {
      const codes = (Array.isArray(payload.codes) ? payload.codes : [payload.code])
        .map((c) => String(c ?? "").trim().toUpperCase())
        .filter(Boolean);
      if (codes.length === 0) {
        throw new ActionError("watch needs at least one equipment code, for example EL293.");
      }
      const added = codes.filter((c) => !next.watch.includes(c));
      next.watch = [...next.watch, ...added];
      next.notes.push(
        event(role, "watch", `${role} is watching ${codes.join(", ")}.`),
      );
      return next;
    }

    case "note": {
      const text = String(payload.text ?? "").trim().slice(0, 500);
      if (!text) throw new ActionError("A note needs some text.");
      next.notes.push(event(role, "note", text));
      return next;
    }

    case "report": {
      const equipment = String(payload.equipment ?? "").trim().toUpperCase();
      const description = String(payload.description ?? "").trim().slice(0, 1000);
      if (!equipment) throw new ActionError("A report needs an equipment code, for example EL293.");
      if (!description) throw new ActionError("A report needs a description of what is wrong.");
      next.reports.push({
        id: id("rep"),
        equipment,
        description,
        at: new Date().toISOString(),
      });
      next.notes.push(
        event(role, "report", `Rider reported ${equipment}: ${description}`),
      );
      return next;
    }

    case "simulate": {
      const code = String(payload.code ?? "").trim().toUpperCase();
      if (!code) throw new ActionError("simulate needs an equipment code, for example EL328.");
      const on = payload.on !== false;
      const already = next.simulatedOut.includes(code);
      if (on && !already) {
        next.simulatedOut = [...next.simulatedOut, code];
        next.notes.push(event(role, "simulate", `SIMULATED outage on ${code} (demo control)`));
      } else if (!on && already) {
        next.simulatedOut = next.simulatedOut.filter((c) => c !== code);
        next.notes.push(event(role, "simulate", `SIMULATED outage on ${code} cleared (demo control)`));
      }
      // Candidates are re-scored below, in applyAction, after the live feed is fetched.
      return next;
    }
  }
}

/**
 * Re-score every candidate against the live feed plus the trip's simulated outage
 * codes, using the same `explainRoute` + `scoreRoute` pair `/api/route` uses. Legs,
 * transfers and route id are untouched, so the accepted route and any proposal
 * still resolve to the same id; only `elevators`, `riskScore`, `riskLabel`,
 * `broken` and `explanation` are recomputed.
 */
export async function rescoreCandidates(trip: Trip): Promise<Route[]> {
  const live = await liveSnapshotOrEmpty();
  const outages = [
    ...toRoutingOutages(live),
    ...trip.simulatedOut.map((code) => ({ equipment: code, reason: "SIMULATED (demo control, not the MTA feed)" })),
  ];
  const index = defaultIndex();
  return trip.candidates.map((route) => {
    const dependencies = explainRoute(route);
    const scored = scoreRoute(
      { legs: route.legs, transfers: route.transfers, dependencies },
      index,
      outages,
    );
    return {
      ...route,
      elevators: scored.elevators,
      riskScore: scored.riskScore,
      riskLabel: scored.riskLabel,
      broken: scored.broken,
      explanation: scored.explanation,
    };
  });
}

/**
 * Apply one action with optimistic-concurrency retry. `key` is the capability
 * token from the caller's link; role is derived from it here, never taken from
 * the request body. A key that matches neither `riderKey` nor `companionKey`
 * 403s before any mutation runs.
 *
 * `simulate` additionally requires `payload.demo === true`: the shared demo
 * control identifies itself so an agent cannot flip a fake outage onto a real
 * trip just by holding the rider key.
 */
export async function applyAction(
  tripId: string,
  type: TripActionType,
  key: string,
  payload: Payload = {},
): Promise<Trip> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const trip = await getTrip(tripId);
    if (!trip) throw new ActionError(`No trip with id "${tripId}".`);
    const role = roleForKey(trip, key);
    if (!role) {
      throw new RoleError(
        "This link's key does not match this trip. Use the rider or companion URL exactly as it was shared; a guessed or edited key is not a valid credential.",
      );
    }
    assertRole(type, role);
    if (type === "simulate" && payload.demo !== true) {
      throw new RoleError(
        "simulate is the ?demo=1 control only. Pass demo: true from the demo panel; it is not a normal rider action.",
      );
    }
    let next = mutate(trip, type, role, payload);
    if (type === "simulate") {
      next = { ...next, candidates: await rescoreCandidates(next) };
    }
    try {
      return await putTrip(next);
    } catch (err) {
      if (err instanceof StaleWriteError) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not write the trip after 4 attempts.");
}

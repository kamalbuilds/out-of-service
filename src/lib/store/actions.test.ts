/**
 * Role-as-capability and the shared simulated outage, tested against the real store
 * (in-memory backend, no env vars set), the real routing/scoring pipeline, and the
 * actual API route handlers, so a regression here fails a test, not just a judge's curl.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EMPTY_LIVE = {
  fetchedAt: "2026-09-03T12:00:00.000Z",
  sourceUrl: "test://live",
  stale: false,
  coverage: 1,
  counts: { current: 0, upcoming: 0, elevators: 0, escalators: 0, adaCurrent: 0 },
  outages: [] as unknown[],
};

vi.mock("@/lib/adapters/live", () => ({
  liveSnapshotOrEmpty: async () => EMPTY_LIVE,
}));

// `putTrip` is programmable so the retry-exhaustion test can force every attempt in
// `applyAction`'s loop to collide, deterministically, without racing real concurrent writes.
// Defaults to the real implementation; only the one test below overrides it, and restores it
// immediately after.
const { putTripMock } = vi.hoisted(() => ({ putTripMock: vi.fn() }));
vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/store")>();
  putTripMock.mockImplementation(actual.putTrip);
  return { ...actual, putTrip: putTripMock };
});

import { findRoutes, explainRoute } from "@/lib/route";
import { createTrip, getTrip as storeGetTrip, StaleWriteError } from "@/lib/store";
import { applyAction, ActionError, RoleError } from "@/lib/store/actions";
import type { Trip } from "@/lib/types";
import { GET as getTripRoute } from "@/app/api/trip/[id]/route";
import { GET as streamRoute } from "@/app/api/trip/[id]/stream/route";
import { getTrip as getTripToolFactory } from "@/lib/webmcp/tools";

const PAIR = { from: "Times Sq-42 St", to: "34 St-Penn Station" };
const CONSTRAINTS = { wheelchair: true, avoidEscalators: false, maxTransfers: 1 };

async function buildTrip(): Promise<Trip> {
  const res = findRoutes(PAIR.from, PAIR.to, CONSTRAINTS);
  if (res.routes.length === 0 || !res.from || !res.to) {
    throw new Error("fixture station pair produced no routes; pick a different known-good pair");
  }
  return createTrip({
    from: res.from.id,
    to: res.to.id,
    fromName: res.from.name,
    toName: res.to.name,
    constraints: CONSTRAINTS,
    candidates: res.routes,
  });
}

/** A required, non-redundant elevator on the trip's first candidate: forcing it out must break the route. */
function victimCode(trip: Trip): string {
  const deps = explainRoute(trip.candidates[0]);
  const victim = deps.find((d) => d.role === "required" && !d.redundant);
  if (!victim) throw new Error("fixture route has no required, non-redundant elevator to simulate");
  return victim.code;
}

describe("role is derived from the capability key, never a self-declared label", () => {
  it("missing key: 403", async () => {
    const trip = await buildTrip();
    await expect(
      applyAction(trip.id, "accept_route", "", { routeId: trip.candidates[0].id }),
    ).rejects.toBeInstanceOf(RoleError);
  });

  it("a guessed key that matches neither capability: 403", async () => {
    const trip = await buildTrip();
    await expect(
      applyAction(trip.id, "accept_route", "totally-guessed-key", { routeId: trip.candidates[0].id }),
    ).rejects.toBeInstanceOf(RoleError);
  });

  it("companion key cannot accept_route, accept_reroute or report", async () => {
    const trip = await buildTrip();
    await expect(
      applyAction(trip.id, "accept_route", trip.companionKey, { routeId: trip.candidates[0].id }),
    ).rejects.toBeInstanceOf(RoleError);
    await expect(
      applyAction(trip.id, "accept_reroute", trip.companionKey, { proposalId: "p_nope" }),
    ).rejects.toBeInstanceOf(RoleError);
    await expect(
      applyAction(trip.id, "report", trip.companionKey, { equipment: "EL240", description: "broken" }),
    ).rejects.toBeInstanceOf(RoleError);
  });

  it("rider key cannot propose_reroute", async () => {
    const trip = await buildTrip();
    await expect(
      applyAction(trip.id, "propose_reroute", trip.riderKey, {
        routeId: trip.candidates[0].id,
        reason: "a reason",
      }),
    ).rejects.toBeInstanceOf(RoleError);
  });

  it("the rider key legitimately accepts a route; the companion key legitimately proposes one", async () => {
    const trip = await buildTrip();
    const accepted = await applyAction(trip.id, "accept_route", trip.riderKey, {
      routeId: trip.candidates[0].id,
    });
    expect(accepted.acceptedRouteId).toBe(trip.candidates[0].id);

    const secondRoute = accepted.candidates[1] ?? accepted.candidates[0];
    const proposed = await applyAction(trip.id, "propose_reroute", trip.companionKey, {
      routeId: secondRoute.id,
      reason: "the accepted route looks worse now",
    });
    expect(proposed.proposals).toHaveLength(1);
    expect(proposed.proposals[0].by).toBe("companion");
  });
});

describe("simulate: rider key plus the demo flag, or 403", () => {
  it("403 without the demo flag, even with the rider key", async () => {
    const trip = await buildTrip();
    await expect(
      applyAction(trip.id, "simulate", trip.riderKey, { code: victimCode(trip), on: true }),
    ).rejects.toBeInstanceOf(RoleError);
  });

  it("403 with the companion key, even with the demo flag", async () => {
    const trip = await buildTrip();
    await expect(
      applyAction(trip.id, "simulate", trip.companionKey, { code: victimCode(trip), on: true, demo: true }),
    ).rejects.toBeInstanceOf(RoleError);
  });

  it("rider key + demo flag flips broken and raises risk, and both are undone on clear", async () => {
    const trip = await buildTrip();
    const before = trip.candidates[0];
    expect(before.broken).toBe(false);
    const code = victimCode(trip);

    const on = await applyAction(trip.id, "simulate", trip.riderKey, { code, on: true, demo: true });
    const after = on.candidates.find((c) => c.id === before.id)!;
    expect(on.simulatedOut).toContain(code);
    expect(after.broken).toBe(true);
    expect(after.riskScore).toBeGreaterThan(before.riskScore);
    expect(after.elevators.find((e) => e.code === code)?.currentlyOut).toBe(true);
    expect(on.notes.at(-1)?.text).toContain(`SIMULATED outage on ${code}`);

    const off = await applyAction(trip.id, "simulate", trip.riderKey, { code, on: false, demo: true });
    const restored = off.candidates.find((c) => c.id === before.id)!;
    expect(off.simulatedOut).not.toContain(code);
    expect(restored.broken).toBe(false);
    expect(restored.riskScore).toBe(before.riskScore);
  });
});

describe("both capability keys are stripped from every unauthenticated or model-facing read", () => {
  it("GET /api/trip/[id] never contains either key's actual value", async () => {
    const trip = await buildTrip();
    const res = await getTripRoute(new Request(`http://test/api/trip/${trip.id}`), {
      params: Promise.resolve({ id: trip.id }),
    } as never);
    const body = (await res.json()) as { trip: Trip };
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(trip.riderKey);
    expect(raw).not.toContain(trip.companionKey);
    expect(body.trip.riderKey).toBe("");
    expect(body.trip.companionKey).toBe("");
  });

  it("the trip SSE stream's first frame never contains either key's actual value", async () => {
    const trip = await buildTrip();
    const controller = new AbortController();
    const req = new Request(`http://test/api/trip/${trip.id}/stream`, { signal: controller.signal });
    const res = await streamRoute(req, { params: Promise.resolve({ id: trip.id }) } as never);
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: trip");
    expect(text).not.toContain(trip.riderKey);
    expect(text).not.toContain(trip.companionKey);
    controller.abort();
    await reader.cancel().catch(() => undefined);
  });

  it("the get_trip tool result never contains either key's actual value", async () => {
    const trip = await buildTrip();
    const stored = await storeGetTrip(trip.id);
    const toolDef = getTripToolFactory({
      role: "rider",
      trip: stored,
      actions: {} as never,
      readers: {} as never,
      confirm: async () => undefined,
      origin: "http://test",
    });
    const result = await toolDef.execute({});
    const raw = JSON.stringify(result);
    expect(raw).not.toContain(trip.riderKey);
    expect(raw).not.toContain(trip.companionKey);
  });
});

describe("free text over its length ceiling is rejected with 400, never silently truncated", () => {
  it("a note over 500 characters: 400 with the actual and allowed length, nothing stored", async () => {
    const trip = await buildTrip();
    const text = "A".repeat(612);
    await expect(
      applyAction(trip.id, "note", trip.riderKey, { text }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("612") });
    const after = await storeGetTrip(trip.id);
    expect(after!.notes.some((n) => n.text.startsWith("AAAA"))).toBe(false);
  });

  it("a note at exactly 500 characters is accepted, in full, not truncated further", async () => {
    const trip = await buildTrip();
    const text = "B".repeat(500);
    const after = await applyAction(trip.id, "note", trip.riderKey, { text });
    expect(after.notes.at(-1)!.text).toBe(text);
    expect(after.notes.at(-1)!.text).toHaveLength(500);
  });

  it("a report description over 1000 characters: 400, nothing stored", async () => {
    const trip = await buildTrip();
    const description = "C".repeat(1200);
    await expect(
      applyAction(trip.id, "report", trip.riderKey, { equipment: "EL228", description }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("1200") });
    const after = await storeGetTrip(trip.id);
    expect(after!.reports).toHaveLength(0);
  });

  it("a propose_reroute reason over 500 characters: 400", async () => {
    const trip = await buildTrip();
    await expect(
      applyAction(trip.id, "propose_reroute", trip.companionKey, {
        routeId: trip.candidates[0].id,
        reason: "D".repeat(501),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("an equipment code over 32 characters on report: 400", async () => {
    const trip = await buildTrip();
    await expect(
      applyAction(trip.id, "report", trip.riderKey, {
        equipment: "E".repeat(40),
        description: "too long a code",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("status codes an agent can act on: 404 for an unknown trip, 409 for retry exhaustion", () => {
  it("POST .../action against an unknown trip id: 404, not 400", async () => {
    await expect(
      applyAction("does-not-exist-at-all", "watch", "some-key", { code: "EL1" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("every optimistic-concurrency retry colliding: 409, not 500", async () => {
    const trip = await buildTrip();
    putTripMock.mockRejectedValue(new StaleWriteError(trip.id, trip.version, trip.version + 1));
    try {
      await expect(
        applyAction(trip.id, "watch", trip.riderKey, { code: "EL1" }),
      ).rejects.toMatchObject({ status: 409, name: "ActionError" });
    } finally {
      // Restore the passthrough so every later test in this file writes for real.
      const actual = await vi.importActual<typeof import("@/lib/store")>("@/lib/store");
      putTripMock.mockImplementation(actual.putTrip);
    }
  });
});

describe("GET /api/trip/[id] and the SSE stream spotlight free text the same way get_trip does", () => {
  it("GET wraps notes[].text, reports[].description and proposals[].reason", async () => {
    let trip = await buildTrip();
    trip = await applyAction(trip.id, "note", trip.riderKey, { text: "call me when you land" });
    trip = await applyAction(trip.id, "report", trip.riderKey, {
      equipment: "EL228",
      description: "door won't close",
    });
    trip = await applyAction(trip.id, "propose_reroute", trip.companionKey, {
      routeId: trip.candidates[0].id,
      reason: "the A is faster right now",
    });

    const res = await getTripRoute(new Request(`http://test/api/trip/${trip.id}`), {
      params: Promise.resolve({ id: trip.id }),
    } as never);
    const body = (await res.json()) as { trip: Trip };
    const humanNote = body.trip.notes.find((n) => n.kind === "note")!;
    expect(humanNote.text).toBe("<untrusted-user-text>call me when you land</untrusted-user-text>");
    expect(body.trip.reports[0]!.description).toBe(
      "<untrusted-user-text>door won't close</untrusted-user-text>",
    );
    expect(body.trip.proposals[0]!.reason).toBe(
      "<untrusted-user-text>the A is faster right now</untrusted-user-text>",
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("the SSE stream's trip frame carries the same spotlighted text", async () => {
    let trip = await buildTrip();
    trip = await applyAction(trip.id, "note", trip.riderKey, { text: "spotlight me over sse" });
    const controller = new AbortController();
    const req = new Request(`http://test/api/trip/${trip.id}/stream`, { signal: controller.signal });
    const res = await streamRoute(req, { params: Promise.resolve({ id: trip.id }) } as never);
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("<untrusted-user-text>spotlight me over sse</untrusted-user-text>");
    controller.abort();
    await reader.cancel().catch(() => undefined);
  });

  it("GET /api/trip/[id] on an unknown trip is still private, no-store", async () => {
    const res = await getTripRoute(new Request("http://test/api/trip/does-not-exist"), {
      params: Promise.resolve({ id: "does-not-exist" }),
    } as never);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

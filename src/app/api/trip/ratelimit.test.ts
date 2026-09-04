/**
 * Rate limiting on POST /api/trip and POST /api/trip/:id/action, exercised through the real
 * route handlers (in-memory limiter fallback, no KV env in this test run) rather than unit-tested
 * against `checkRateLimit` alone, so a regression in how the routes call it fails here too.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitMemoryForTests } from "@/lib/store/ratelimit";

const EMPTY_LIVE = {
  fetchedAt: "2026-09-03T12:00:00.000Z",
  sourceUrl: "test://live",
  stale: false,
  coverage: 1,
  counts: { current: 0, upcoming: 0, elevators: 0, escalators: 0, adaCurrent: 0 },
  outages: [] as unknown[],
};
vi.mock("@/lib/adapters/live", () => ({ liveSnapshotOrEmpty: async () => EMPTY_LIVE }));

import { POST as createTripRoute } from "./route";
import { POST as actionRoute } from "./[id]/action/route";
import { createTrip } from "@/lib/store";
import { findRoutes } from "@/lib/route";

afterEach(() => {
  __resetRateLimitMemoryForTests();
});

function createReq(ip: string, body: Record<string, unknown>) {
  return new Request("http://test/api/trip", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/trip is rate-limited per IP", () => {
  it("61st trip creation from the same IP within a minute: 429 with Retry-After", async () => {
    const ip = "203.0.113.10";
    // Lines-qualified so this resolves to one complex: "34 St-Penn Station" alone is
    // shared by two complexes (164 A C E, 318 1 2 3 LIRR) and now correctly returns a 400
    // ambiguous_station rather than a silent pick, which would sink these rate-limit tests.
    const body = {
      from: "Times Sq-42 St",
      to: "34 St-Penn Station (A C E)",
      constraints: { wheelchair: true },
    };
    let last: Response | undefined;
    for (let i = 0; i < 61; i++) {
      last = await createTripRoute(createReq(ip, body));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
    const payload = await last!.json();
    expect(payload.error).toBeTruthy();
  }, 20_000);

  it("a different IP is unaffected by another IP's 60 requests", async () => {
    // Lines-qualified so this resolves to one complex: "34 St-Penn Station" alone is
    // shared by two complexes (164 A C E, 318 1 2 3 LIRR) and now correctly returns a 400
    // ambiguous_station rather than a silent pick, which would sink these rate-limit tests.
    const body = {
      from: "Times Sq-42 St",
      to: "34 St-Penn Station (A C E)",
      constraints: { wheelchair: true },
    };
    for (let i = 0; i < 60; i++) {
      await createTripRoute(createReq("203.0.113.20", body));
    }
    const res = await createTripRoute(createReq("203.0.113.21", body));
    expect(res.status).toBe(201);
  }, 20_000);
});

describe("POST /api/trip/[id]/action is rate-limited per IP and per trip", () => {
  async function buildTrip() {
    const res = findRoutes("Times Sq-42 St", "34 St-Penn Station", {
      wheelchair: true,
      avoidEscalators: false,
      maxTransfers: 1,
    });
    return createTrip({
      from: res.from!.id,
      to: res.to!.id,
      fromName: res.from!.name,
      toName: res.to!.name,
      constraints: { wheelchair: true, avoidEscalators: false, maxTransfers: 1 },
      candidates: res.routes,
    });
  }

  function actionReq(ip: string, tripId: string, key: string) {
    return new Request(`http://test/api/trip/${tripId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ type: "watch", key, payload: { code: "EL1" } }),
    });
  }

  it("71 rapid actions on one trip from one IP: 429 after the limit, with Retry-After", async () => {
    const trip = await buildTrip();
    const ip = "203.0.113.30";
    let last: Response | undefined;
    for (let i = 0; i < 71; i++) {
      last = await actionRoute(actionReq(ip, trip.id, trip.riderKey), {
        params: Promise.resolve({ id: trip.id }),
      } as never);
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
  });

  it("actions on a second trip from the same hammering IP are also capped (per-IP axis holds across trips)", async () => {
    const tripA = await buildTrip();
    const tripB = await buildTrip();
    const ip = "203.0.113.31";
    for (let i = 0; i < 60; i++) {
      await actionRoute(actionReq(ip, tripA.id, tripA.riderKey), {
        params: Promise.resolve({ id: tripA.id }),
      } as never);
    }
    const res = await actionRoute(actionReq(ip, tripB.id, tripB.riderKey), {
      params: Promise.resolve({ id: tripB.id }),
    } as never);
    expect(res.status).toBe(429);
  });

  function acceptRouteReq(ip: string, tripId: string, key: string, routeId: string) {
    return new Request(`http://test/api/trip/${tripId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ type: "accept_route", key, payload: { routeId } }),
    });
  }

  function noteReq(ip: string, tripId: string, key: string, i: number) {
    return new Request(`http://test/api/trip/${tripId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ type: "note", key, payload: { text: `note ${i}` } }),
    });
  }

  it("the contended tier (accept_route) caps at 12/min per trip: the 12th passes, the 13th is 429", async () => {
    const trip = await buildTrip();
    const ip = "203.0.113.40";
    const routeId = trip.candidates[0]!.id;

    let twelfth: Response | undefined;
    for (let i = 0; i < 12; i++) {
      twelfth = await actionRoute(acceptRouteReq(ip, trip.id, trip.riderKey, routeId), {
        params: Promise.resolve({ id: trip.id }),
      } as never);
    }
    // A check that can fail: the 12th contended action must clear the ceiling, not trip it.
    expect(twelfth!.status).toBe(200);

    const thirteenth = await actionRoute(acceptRouteReq(ip, trip.id, trip.riderKey, routeId), {
      params: Promise.resolve({ id: trip.id }),
    } as never);
    expect(thirteenth.status).toBe(429);
    expect(thirteenth.headers.get("Retry-After")).toBeTruthy();
    const payload = await thirteenth.json();
    expect(payload.error).toMatch(/contended/i);
  });

  it("the cheap tier (note) has its own counter: still 200 after the contended tier is exhausted on the same trip", async () => {
    const trip = await buildTrip();
    const ip = "203.0.113.41";
    const routeId = trip.candidates[0]!.id;

    for (let i = 0; i < 13; i++) {
      await actionRoute(acceptRouteReq(ip, trip.id, trip.riderKey, routeId), {
        params: Promise.resolve({ id: trip.id }),
      } as never);
    }

    for (let i = 0; i < 5; i++) {
      const res = await actionRoute(noteReq(ip, trip.id, trip.riderKey, i), {
        params: Promise.resolve({ id: trip.id }),
      } as never);
      expect(res.status).toBe(200);
    }
  });
});

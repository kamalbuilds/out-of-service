"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Constraints, LiveOutage, LiveSnapshot, Role, Route, Trip } from "@/lib/types";
import type { TripActions, TripReaders } from "@/lib/webmcp/contracts";
import { defaultReaders } from "@/lib/webmcp/readers";

export type SimulatedOutage = LiveOutage & { simulated: true };

export type TripContextValue = {
  trip: Trip;
  role: Role;
  actions: TripActions;
  readers: TripReaders;
  live: LiveSnapshot | null;
  /** Live outages plus any ?demo=1 simulations, simulated ones flagged. */
  outages: LiveOutage[];
  simulated: SimulatedOutage[];
  simulate: (code: string) => void;
  clearSimulated: () => void;
  demo: boolean;
  tripStream: "connecting" | "open" | "closed";
  liveStream: "connecting" | "open" | "closed";
  error: string | null;
};

const TripContext = createContext<TripContextValue | null>(null);

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrip() must be called inside <TripProvider>.");
  return ctx;
}

async function postAction(
  tripId: string,
  type: string,
  role: Role,
  payload: Record<string, unknown>,
): Promise<Trip> {
  const res = await fetch(`/api/trip/${tripId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, role, payload }),
  });
  const body = (await res.json()) as { trip?: Trip; error?: string };
  if (!res.ok || !body.trip) {
    throw new Error(body.error ?? `The server rejected ${type} with HTTP ${res.status}.`);
  }
  return body.trip;
}

export function TripProvider({
  tripId,
  role,
  initialTrip,
  demo,
  children,
}: {
  tripId: string;
  role: Role;
  initialTrip: Trip;
  demo: boolean;
  children: ReactNode;
}) {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [simulated, setSimulated] = useState<SimulatedOutage[]>([]);
  const [tripStream, setTripStream] = useState<TripContextValue["tripStream"]>("connecting");
  const [liveStream, setLiveStream] = useState<TripContextValue["liveStream"]>("connecting");
  const [error, setError] = useState<string | null>(null);

  const versionRef = useRef(initialTrip.version);
  const apply = useCallback((next: Trip) => {
    if (next.version < versionRef.current) return;
    versionRef.current = next.version;
    setTrip(next);
  }, []);

  /*
   * Trip SSE: the rider sees the companion's proposal without reloading, in a
   * background tab as much as a foreground one, so this stream is never
   * dropped while the page is open.
   */
  useEffect(() => {
    let stopped = false;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const disconnect = () => {
      source?.close();
      source = null;
      setTripStream("closed");
    };

    const connect = () => {
      if (stopped || source) return;
      setTripStream("connecting");
      const es = new EventSource(`/api/trip/${tripId}/stream`);
      source = es;
      es.addEventListener("open", () => setTripStream("open"));
      es.addEventListener("trip", (e) => {
        apply(JSON.parse((e as MessageEvent).data) as Trip);
        setTripStream("open");
      });
      es.addEventListener("end", () => {
        disconnect();
        retry = setTimeout(connect, 500);
      });
      es.addEventListener("error", () => setTripStream("closed"));
    };

    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      disconnect();
    };
  }, [tripId, apply]);

  /*
   * Live SSE: an elevator on this route goes out and both columns re-render.
   *
   * This one is dropped while the tab is hidden. A browser allows six sockets
   * per origin over HTTP/1.1 and an open trip page would otherwise hold two of
   * them forever, so three tabs on one dev server deadlock every other request
   * to it, including the POST that creates the next trip. Backgrounding the
   * live stream keeps a trip page to one persistent socket; on return the
   * server's first event is a full snapshot, so nothing is missed.
   */
  useEffect(() => {
    let source: EventSource | null = null;

    const take = (e: Event) => {
      const data = JSON.parse((e as MessageEvent).data) as Partial<LiveSnapshot>;
      setLive((prev) => ({
        fetchedAt: data.fetchedAt ?? prev?.fetchedAt ?? new Date().toISOString(),
        sourceUrl: data.sourceUrl ?? prev?.sourceUrl ?? "",
        stale: data.stale ?? false,
        coverage: data.coverage ?? prev?.coverage ?? 0,
        counts: data.counts ??
          prev?.counts ?? { current: 0, upcoming: 0, elevators: 0, escalators: 0, adaCurrent: 0 },
        outages: data.outages ?? prev?.outages ?? [],
      }));
      setLiveStream("open");
    };

    const connect = () => {
      if (source || document.hidden) return;
      const es = new EventSource("/api/live/stream");
      source = es;
      es.addEventListener("snapshot", take);
      es.addEventListener("change", take);
      es.addEventListener("heartbeat", () => setLiveStream("open"));
      es.addEventListener("error", () => setLiveStream("closed"));
    };

    const disconnect = () => {
      source?.close();
      source = null;
      setLiveStream("closed");
    };

    const onVisibility = () => {
      if (document.hidden) disconnect();
      else connect();
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      disconnect();
    };
  }, []);

  /* ?demo=1 only. Never written to the store, never sent to the index. */
  const simulate = useCallback(
    (code: string) => {
      const upper = code.trim().toUpperCase();
      if (!upper) return;
      const known = trip.candidates
        .flatMap((r) => r.elevators)
        .find((e) => e.code === upper);
      const now = new Date();
      setSimulated((prev) =>
        prev.some((o) => o.equipmentCode === upper)
          ? prev
          : [
              ...prev,
              {
                equipmentCode: upper,
                equipmentType: "EL",
                station: known?.station ?? "simulated",
                lines: [],
                serving: known?.serving ?? "simulated outage for the demo",
                ada: true,
                outageStart: now.toISOString(),
                estimatedReturn: null,
                reason: "SIMULATED (demo control, not from the MTA feed)",
                isUpcoming: false,
                isMaintenance: false,
                isCurrent: true,
                hoursOut: 0,
                simulated: true,
              },
            ],
      );
    },
    [trip.candidates],
  );

  const clearSimulated = useCallback(() => setSimulated([]), []);

  const outages = useMemo<LiveOutage[]>(
    () => [...simulated, ...(live?.outages ?? [])],
    [simulated, live],
  );

  const run = useCallback(
    async (type: string, payload: Record<string, unknown>) => {
      setError(null);
      try {
        const next = await postAction(tripId, type, role, payload);
        apply(next);
        return next;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [tripId, role, apply],
  );

  const actions = useMemo<TripActions>(
    () => ({
      async createTrip(input) {
        const res = await fetch("/api/trip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json()) as { trip?: Trip; error?: string };
        if (!res.ok || !body.trip) {
          throw new Error(body.error ?? `Creating the trip failed with HTTP ${res.status}.`);
        }
        return body.trip;
      },
      acceptRoute: (routeId) => run("accept_route", { routeId }),
      acceptReroute: (proposalId) => run("accept_reroute", { proposalId }),
      proposeReroute: (route: Route, reason: string) =>
        run("propose_reroute", { route, routeId: route.id, reason }),
      watch: (codes) => run("watch", { codes }),
      addNote: (text) => run("note", { text }),
      report: (equipment, description) => run("report", { equipment, description }),
      async findRoutes(from: string, to: string, constraints: Constraints) {
        const res = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, constraints }),
        });
        const body = (await res.json()) as {
          routes?: Route[];
          error?: string;
          fetchedAt?: string;
        };
        if (!res.ok || !body.routes) {
          throw new Error(body.error ?? `Route search failed with HTTP ${res.status}.`);
        }
        return { routes: body.routes, fetchedAt: body.fetchedAt };
      },
    }),
    [run],
  );

  /* The rider's and the companion's agents read the same endpoints. The only
     thing added here is the demo overlay, always labelled SIMULATED so a model
     never reports it as feed truth. */
  const readers = useMemo<TripReaders>(() => {
    const base = defaultReaders();
    return {
      ...base,
      async currentOutages(input) {
        const real = await base.currentOutages(input);
        if (simulated.length === 0) return real;
        return {
          ...real,
          outages: [
            ...simulated.map((o) => ({
              equipment: o.equipmentCode,
              station: o.station,
              serving: `SIMULATED (demo control, not the MTA feed): ${o.serving}`,
              ada: true,
              outageDate: o.outageStart,
            })),
            ...real.outages,
          ],
        };
      },
    };
  }, [simulated]);

  const value = useMemo<TripContextValue>(
    () => ({
      trip,
      role,
      actions,
      readers,
      live,
      outages,
      simulated,
      simulate,
      clearSimulated,
      demo,
      tripStream,
      liveStream,
      error,
    }),
    [
      trip, role, actions, readers, live, outages, simulated, simulate,
      clearSimulated, demo, tripStream, liveStream, error,
    ],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

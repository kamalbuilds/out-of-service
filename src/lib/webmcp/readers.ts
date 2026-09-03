/**
 * Default `TripReaders` over the two endpoints the UI/live agents own: `/api/stations`
 * and `/api/live`. The UI agent can pass its own readers into <WebMCPTools>; this exists so
 * the tool layer works the moment those routes answer, with no extra wiring.
 *
 * Provenance rule: whatever `source` / `fetchedAt` the endpoint returns is passed straight
 * through to the model. When an endpoint omits them, the tool result omits them too rather
 * than inventing a citation.
 */
import type { LiveOutage } from "@/lib/types";
import type { ElevatorRef, Outage, SourceRef, StationSummary, TripReaders } from "./contracts";

type ApiEnvelope = { source?: SourceRef; fetchedAt?: string };

async function getJson<T>(url: string): Promise<T & ApiEnvelope> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${url} returned ${res.status}. ${body.slice(0, 160)} Retry once; if it repeats, tell the rider the live feed is unavailable and fall back to history only.`
    );
  }
  return (await res.json()) as T & ApiEnvelope;
}

/** Project a full feed row down to what a model needs, keeping the words a human would say. */
function toOutage(o: LiveOutage): Outage {
  return {
    equipment: o.equipmentCode,
    station: o.station,
    line: o.lines.join("/"),
    serving: o.serving,
    reason: o.reason,
    ada: o.ada,
    outageDate: o.outageStart,
    estimatedReturn: o.estimatedReturn,
    upcoming: o.isUpcoming,
  };
}

function matchStation(row: LiveOutage, needle: string) {
  const n = needle.trim().toLowerCase();
  return [row.station, row.stationComplexId, row.gtfsStopId].some(
    (v) => v && String(v).toLowerCase().includes(n)
  );
}

export function defaultReaders(): TripReaders {
  return {
    async listStations({ query, line, limit = 20 }) {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (line) params.set("line", line);
      params.set("limit", String(limit));
      const data = await getJson<{ stations: StationSummary[] }>(`/api/stations?${params}`);
      return {
        stations: (data.stations ?? []).slice(0, limit),
        source: data.source,
        fetchedAt: data.fetchedAt,
      };
    },

    async stationStatus({ station }) {
      const data = await getJson<{
        station: StationSummary;
        elevators: ElevatorRef[];
        outages: LiveOutage[];
      }>(`/api/stations?station=${encodeURIComponent(station)}`);
      if (!data.station) {
        throw new Error(
          `No accessible station matched "${station}". Call list_accessible_stations with a shorter name fragment to find the exact complex id.`
        );
      }
      return {
        station: data.station,
        elevators: data.elevators ?? [],
        outages: (data.outages ?? []).map(toOutage),
        source: data.source,
        fetchedAt: data.fetchedAt,
      };
    },

    async elevatorHistory({ equipment }) {
      const data = await getJson<{ equipment?: ElevatorRef }>(
        `/api/stations?equipment=${encodeURIComponent(equipment)}`
      );
      if (!data.equipment) {
        throw new Error(
          `No elevator with code ${equipment} in the MTA equipment master. Codes look like EL240 or ES101; station_status lists the codes for a station.`
        );
      }
      return {
        equipment: data.equipment,
        currentlyOut: data.equipment.currentlyOut,
        estimatedReturn: data.equipment.estimatedReturn,
        source: data.source ?? data.equipment.source,
        fetchedAt: data.fetchedAt,
      };
    },

    async currentOutages({ station, line, adaOnly, includeUpcoming }) {
      const data = await getJson<{ outages: LiveOutage[]; sourceUrl?: string; coverage?: number }>(
        "/api/live"
      );
      let rows = data.outages ?? [];
      if (!includeUpcoming) rows = rows.filter((o) => o.isCurrent);
      if (station) rows = rows.filter((o) => matchStation(o, station));
      if (line) {
        const want = line.trim().toUpperCase();
        rows = rows.filter((o) => o.lines.some((l) => l.toUpperCase() === want));
      }
      if (adaOnly) rows = rows.filter((o) => o.ada === true);
      return {
        outages: rows.map(toOutage),
        source: data.source ?? {
          dataset: "MTA elevator/escalator live outage feed",
          query: data.sourceUrl ?? "/api/live",
          rows: (data.outages ?? []).length,
        },
        fetchedAt: data.fetchedAt,
      };
    },
  };
}

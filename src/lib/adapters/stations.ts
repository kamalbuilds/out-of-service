/**
 * Bridge from the index agent's module (`src/lib/index`, snake_case index
 * records) to the camelCase view types this app renders. Nothing is computed
 * here that the index does not already carry.
 */
import {
  getEquipment as rawGetEquipment,
  getStationEquipment as rawGetStationEquipment,
  listStations as rawListStations,
  loadIndex,
  scoreStation as rawScoreStation,
} from "@/lib/index";
import type { EquipmentIndexEntry, StationScore } from "@/lib/index/types";
import type { ElevatorRef, StationSummary, Tier } from "@/lib/types";

export function normaliseTier(raw: string | undefined): Tier {
  if (!raw) return "unknown";
  if (raw === "reliable") return "reliable";
  if (raw === "watch") return "watch";
  if (raw.startsWith("unreliable")) return "unreliable";
  return "unknown";
}

const TIER_ORDER: Record<Tier, number> = {
  reliable: 0,
  unknown: 1,
  watch: 2,
  unreliable: 3,
};

export function stationId(s: { station_complex_mrn: string | null; gtfs_stop_ids: string[]; station: string }): string {
  return s.station_complex_mrn ?? s.gtfs_stop_ids[0] ?? s.station;
}

export function listStations(): StationSummary[] {
  return rawListStations().map((s) => {
    let worst: Tier = "reliable";
    let elevators = 0;
    for (const code of s.equipment_codes) {
      const e = rawGetEquipment(code);
      if (!e) continue;
      if (e.equipment_type === "EL") elevators += 1;
      const t = normaliseTier(e.tier);
      if (TIER_ORDER[t] > TIER_ORDER[worst]) worst = t;
    }
    // The equipment master writes a station's lines as "A/C/E" in one field and
    // sometimes also as separate rows, so split on both separators and dedupe.
    const lines = [
      ...new Set(s.lines.flatMap((l) => l.split(/[,/]/).map((x) => x.trim())).filter(Boolean)),
    ];
    return {
      id: stationId(s),
      name: s.station,
      gtfsStopIds: s.gtfs_stop_ids.flatMap((g) => g.split("/").map((x) => x.trim())).filter(Boolean),
      lines,
      elevatorCount: elevators,
      worstTier: worst,
      ada: true,
    };
  });
}

export function getEquipment(code: string): EquipmentIndexEntry | undefined {
  return rawGetEquipment(code.trim().toUpperCase());
}

export function getStationEquipment(id: string): EquipmentIndexEntry[] {
  return rawGetStationEquipment(id);
}

export function scoreStation(id: string): StationScore {
  return rawScoreStation(id);
}

export function indexMeta(): {
  rows: number;
  elevators: number;
  escalators: number;
  stations: number;
  currentlyOut: number;
  source: EquipmentIndexEntry["metrics"]["source"] | null;
} {
  const rows = loadIndex();
  return {
    rows: rows.length,
    elevators: rows.filter((r) => r.equipment_type === "EL").length,
    escalators: rows.filter((r) => r.equipment_type === "ES").length,
    stations: rawListStations().length,
    currentlyOut: rows.filter((r) => r.currently_out).length,
    source: rows[0]?.metrics.source ?? null,
  };
}

/**
 * The predicate the home page's station-filter input (`StationPicker`) uses, extracted as a pure
 * function so it is unit-testable without a browser. Guarded against a malformed station record
 * (a missing/non-string `name`, a non-array `lines`, or a non-string line) throwing `TypeError:
 * ... .toLowerCase is not a function` mid-keystroke: `listStations()` today always returns clean
 * records, but nothing at the type level stops that from changing, and a bad row should be
 * treated as "does not match" for that one station, not crash the filter for every station.
 */
export function stationMatchesQuery(station: StationSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = typeof station.name === "string" ? station.name.toLowerCase() : "";
  if (name.includes(q)) return true;
  const lines = Array.isArray(station.lines) ? station.lines : [];
  return lines.some((l) => typeof l === "string" && l.toLowerCase() === q);
}

/** Name, complex id or GTFS stop id to a station, in that order of confidence. */
export function resolveStation(query: string, stations = listStations()): StationSummary | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    stations.find((s) => s.id.toLowerCase() === q) ??
    stations.find((s) => s.gtfsStopIds.some((g) => g.toLowerCase() === q)) ??
    stations.find((s) => s.name.toLowerCase() === q) ??
    stations.find((s) => s.name.toLowerCase().startsWith(q)) ??
    stations.find((s) => s.name.toLowerCase().includes(q)) ??
    null
  );
}

/** One index row as the `ElevatorRef` the UI renders and the tools return. */
export function toElevatorRef(
  e: EquipmentIndexEntry,
  live?: { estimatedReturn: string | null; isCurrent: boolean },
): ElevatorRef {
  const m = e.metrics;
  return {
    code: e.equipment_code,
    station: e.station,
    serving: e.serving,
    tier: normaliseTier(e.tier),
    availability24m: m.availability_24h_mean_24m ?? undefined,
    unscheduled24m: m.unscheduled_24m,
    entrapments24m: m.entrapments_24m,
    currentlyOut: live ? live.isCurrent : e.currently_out,
    estimatedReturn:
      live?.estimatedReturn ?? e.current_outage?.estimatedreturntoservice ?? undefined,
    source: {
      dataset: m.source.dataset,
      query: m.source.query,
      rows: m.source.rows,
    },
  };
}

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
import type { StationSummary, Tier } from "@/lib/types";

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
    return {
      id: stationId(s),
      name: s.station,
      gtfsStopIds: s.gtfs_stop_ids,
      lines: s.lines,
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

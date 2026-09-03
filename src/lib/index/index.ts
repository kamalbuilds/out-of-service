// Query layer over the per-equipment reliability index (data/index.json).
// Pure data + pure functions: no React, no Next.js, safe to import from a
// server route, a client component, or a plain script/test.

import rawIndex from "../../../data/index.json" with { type: "json" };
import type { AdaNeighbor, EquipmentIndexEntry, StationScore, StationSummary } from "./types";

export type {
  AdaNeighbor,
  CurrentOutage,
  EquipmentIndexEntry,
  EquipmentMetrics,
  EquipmentRank,
  EquipmentType,
  MetricSource,
  StationScore,
  StationSummary,
  Tier,
  WorstMonth,
} from "./types";

// The JSON import is a plain array; assert the shape built by scripts/build-index.ts.
const INDEX = rawIndex as unknown as EquipmentIndexEntry[];

/** Full per-equipment index, as built by scripts/build-index.ts. */
export function loadIndex(): EquipmentIndexEntry[] {
  return INDEX;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

let codeMap: Map<string, EquipmentIndexEntry> | null = null;
function getCodeMap(): Map<string, EquipmentIndexEntry> {
  if (!codeMap) {
    codeMap = new Map(INDEX.map((e) => [e.equipment_code, e]));
  }
  return codeMap;
}

/** Look up a single elevator/escalator by its equipment_code (e.g. "EL293"). */
export function getEquipment(code: string): EquipmentIndexEntry | undefined {
  return getCodeMap().get(normalizeCode(code));
}

/**
 * All equipment at a station, matched by either its station_complex_mrn
 * ("119") or one of its GTFS stop ids ("L06").
 */
export function getStationEquipment(stationComplexMrnOrGtfsStopId: string): EquipmentIndexEntry[] {
  const key = stationComplexMrnOrGtfsStopId.trim();
  return INDEX.filter(
    (e) => e.station_complex_mrn === key || e.gtfs_stop_id === key
  );
}

let stationsCache: StationSummary[] | null = null;

/**
 * Every station with at least one ADA elevator, deduplicated by
 * station_complex_mrn (falling back to station name when mrn is missing).
 */
export function listStations(): StationSummary[] {
  if (stationsCache) return stationsCache;

  const byStation = new Map<string, StationSummary>();
  for (const e of INDEX) {
    if (!e.ada) continue;
    const key = e.station_complex_mrn ?? `name:${e.station}`;
    let summary = byStation.get(key);
    if (!summary) {
      summary = {
        station: e.station,
        station_complex_mrn: e.station_complex_mrn,
        gtfs_stop_ids: [],
        lines: [],
        equipment_codes: [],
      };
      byStation.set(key, summary);
    }
    if (e.gtfs_stop_id && !summary.gtfs_stop_ids.includes(e.gtfs_stop_id)) {
      summary.gtfs_stop_ids.push(e.gtfs_stop_id);
    }
    for (const line of e.lines.split(",").map((l) => l.trim()).filter(Boolean)) {
      if (!summary.lines.includes(line)) summary.lines.push(line);
    }
    if (!summary.equipment_codes.includes(e.equipment_code)) {
      summary.equipment_codes.push(e.equipment_code);
    }
  }

  stationsCache = [...byStation.values()].sort((a, b) => a.station.localeCompare(b.station));
  return stationsCache;
}

const UNRELIABLE_TIERS = new Set(["unreliable", "unreliable (entrapment history)"]);

/**
 * Aggregates a station's elevators/escalators into a single accessibility
 * score: the weakest link's trailing-24-month availability, how many pieces
 * of equipment are in an unreliable tier, and what share have a documented
 * redundant path.
 */
export function scoreStation(stationId: string): StationScore {
  const equipment = getStationEquipment(stationId);

  let minAvailability: number | null = null;
  let minCode: string | null = null;
  let unreliableCount = 0;
  let redundantCount = 0;

  for (const e of equipment) {
    const avail = e.metrics.availability_24h_mean_24m;
    if (avail !== null && (minAvailability === null || avail < minAvailability)) {
      minAvailability = avail;
      minCode = e.equipment_code;
    }
    if (UNRELIABLE_TIERS.has(e.tier)) unreliableCount += 1;
    if (e.redundant) redundantCount += 1;
  }

  return {
    station_complex_mrn: equipment[0]?.station_complex_mrn ?? null,
    station: equipment[0]?.station ?? null,
    equipment_count: equipment.length,
    min_elevator_availability_24m: minAvailability,
    min_elevator_code: minCode,
    unreliable_count: unreliableCount,
    redundant_count: redundantCount,
    redundant_coverage: equipment.length > 0 ? redundantCount / equipment.length : null,
  };
}

/**
 * The next accessible (ADA) stations north and south of a given GTFS stop,
 * parsed from the equipment master's "117, L"-style strings at build time.
 * Looks across every elevator recorded at that stop and returns the first
 * non-null neighbor in each direction (they agree in practice, since they
 * describe the station, not the individual elevator).
 */
export function nextAdaNeighbors(gtfsStopId: string): { north: AdaNeighbor | null; south: AdaNeighbor | null } {
  const equipment = INDEX.filter((e) => e.gtfs_stop_id === gtfsStopId.trim());
  let north: AdaNeighbor | null = null;
  let south: AdaNeighbor | null = null;
  for (const e of equipment) {
    if (!north && e.nextadanorth) north = e.nextadanorth;
    if (!south && e.nextadasouth) south = e.nextadasouth;
  }
  return { north, south };
}

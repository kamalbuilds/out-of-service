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
  const base = rawListStations().map((s) => {
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

  // Two different complexes can share the exact same bare station name - "34 St-Penn
  // Station" is complex 164 (A C E) and complex 318 (1 2 3 LIRR). Any station whose name
  // is not unique across complexes gets a `displayName` that names its lines, so a picker
  // option, a tool result or a trip record never shows the same bare string for two
  // different places.
  const nameCounts = new Map<string, number>();
  for (const s of base) nameCounts.set(s.name, (nameCounts.get(s.name) ?? 0) + 1);

  return base.map((s) => ({
    ...s,
    displayName: (nameCounts.get(s.name) ?? 0) > 1 ? `${s.name} (${s.lines.join(" ")})` : s.name,
  }));
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

export type StationCandidate = { id: string; name: string; lines: string[] };
export type AmbiguousStation = { ambiguous: true; candidates: StationCandidate[] };

/**
 * Same lookup order as `resolveStation`, except a bare name that matches more than one
 * complex is never narrowed to the first match: it comes back as a structured ambiguity
 * instead, so the caller can ask for the complex id or the lines-qualified name rather
 * than silently guessing. "34 St-Penn Station" is the concrete case: complex 164 (A C E)
 * and complex 318 (1 2 3 LIRR) share the bare name, and only one of them is the trip the
 * rider meant. An exact complex id, a GTFS stop id, or a `displayName` match (the name
 * with its lines in parentheses) always resolves uniquely and never hits the ambiguous
 * branch, because those are already specific to one complex.
 */
export function resolveStationOrAmbiguous(
  query: string,
  stations = listStations(),
): StationSummary | AmbiguousStation | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const byId = stations.find((s) => s.id.toLowerCase() === q);
  if (byId) return byId;

  const byGtfs = stations.find((s) => s.gtfsStopIds.some((g) => g.toLowerCase() === q));
  if (byGtfs) return byGtfs;

  const byDisplayName = stations.find((s) => s.displayName.toLowerCase() === q);
  if (byDisplayName) return byDisplayName;

  const nameMatches = stations.filter((s) => s.name.toLowerCase() === q);
  if (nameMatches.length > 1) {
    return {
      ambiguous: true,
      candidates: nameMatches.map((s) => ({ id: s.id, name: s.name, lines: s.lines })),
    };
  }
  if (nameMatches.length === 1) return nameMatches[0];

  const byStart = stations.find((s) => s.name.toLowerCase().startsWith(q));
  if (byStart) return byStart;

  return stations.find((s) => s.name.toLowerCase().includes(q)) ?? null;
}

/** The `message` field of the 400 response `POST /api/trip` returns for an ambiguous name. */
export function ambiguousStationMessage(query: string, ambiguous: AmbiguousStation): string {
  const list = ambiguous.candidates
    .map((c) => `${c.name} (${c.lines.join(" ")}) [${c.id}]`)
    .join(", ");
  return `"${query.trim()}" matches ${ambiguous.candidates.length} complexes: ${list}. Send the complex id or the name with lines.`;
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

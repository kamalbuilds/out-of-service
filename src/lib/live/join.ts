/**
 * Join live outage records to the MTA equipment master for station/stop
 * enrichment (gtfsStopId, station complex id, redundancy, nearest ADA
 * alternates).
 *
 * Equipment master source (fetched/committed by the data-index agent):
 * https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json
 *
 * `src/lib/index/` (owned by another agent, builds the historical
 * reliability index keyed by equipment code) may eventually export a
 * typed `EquipmentMasterRecord`. It is currently empty, so this module
 * defines its own minimal shape for the fields it actually reads and
 * accepts anything structurally compatible.
 */
import type { LiveOutage } from "./mta";

/** Minimal local type for one row of the MTA equipment master feed. */
export interface EquipmentMasterRecord {
  equipmentno: string;
  station: string;
  elevatorsgtfsstopid?: string;
  stationcomplexid?: string;
  redundant?: number | string | boolean;
  nextadanorth?: string | null;
  nextadasouth?: string | null;
  isactive?: string;
  [key: string]: unknown;
}

export interface JoinedOutage extends LiveOutage {
  gtfsStopId: string | null;
  stationComplexId: string | null;
  /** true if the equipment master flags an alternate accessible path (redundant elevator) at this location. */
  redundant: boolean;
  nextAdaNorth: string | null;
  nextAdaSouth: string | null;
  /** true if this equipment code was found in the master; false means enrichment fields are all null/false. */
  matched: boolean;
}

export interface JoinResult {
  outages: JoinedOutage[];
  /** matched / total, 0 when there are no outages. */
  coverage: number;
  matchedCount: number;
  totalCount: number;
}

function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function toBool(value: number | string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim() === "1" || value.trim().toUpperCase() === "Y";
  return false;
}

/**
 * Join normalised live outages with the equipment master, keyed by the
 * normalised equipment code (outage.equipmentCode <-> master.equipmentno).
 */
export function joinLiveWithMaster(
  outages: LiveOutage[],
  equipmentMaster: EquipmentMasterRecord[],
): JoinResult {
  const master = new Map<string, EquipmentMasterRecord>();
  for (const rec of equipmentMaster) {
    if (!rec?.equipmentno) continue;
    master.set(normaliseCode(rec.equipmentno), rec);
  }

  let matchedCount = 0;
  const joined: JoinedOutage[] = outages.map((outage) => {
    const rec = master.get(outage.equipmentCode);
    if (rec) matchedCount += 1;
    return {
      ...outage,
      gtfsStopId: rec?.elevatorsgtfsstopid ?? null,
      stationComplexId: rec?.stationcomplexid ?? null,
      redundant: rec ? toBool(rec.redundant) : false,
      nextAdaNorth: rec?.nextadanorth ?? null,
      nextAdaSouth: rec?.nextadasouth ?? null,
      matched: Boolean(rec),
    };
  });

  const totalCount = outages.length;
  const coverage = totalCount === 0 ? 0 : matchedCount / totalCount;

  return { outages: joined, coverage, matchedCount, totalCount };
}

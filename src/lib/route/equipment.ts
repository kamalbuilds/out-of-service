import equipmentMaster from "../../../data/equipment.json" with { type: "json" };

/** One row of the MTA elevator & escalator equipment master (nyct_ene_equipments.json). */
export type EquipmentRecord = {
  station: string;
  borough: string;
  trainno: string;
  equipmentno: string;
  equipmenttype: string;
  serving: string;
  ADA: string;
  isactive: string;
  nonNYCT: string;
  shortdescription: string;
  linesservedbyelevator: string;
  elevatorsgtfsstopid: string;
  elevatormrn: string;
  stationcomplexid: string;
  nextadanorth: NextAda;
  nextadasouth: NextAda;
  redundant: number;
  busconnections: string;
  alternativeroute: string;
};

/**
 * The master ships `nextadanorth` as a string ("117, L" / "215, B, D / 387, 4").
 * The index builder normalises it to an object, so accept both plus null.
 */
export type NextAda = string | null | { stopId: string; line: string } | Array<{ stopId: string; line: string }>;

export const EQUIPMENT_SOURCE =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json";

const EQUIPMENT_PATH = "data/equipment.json";

function coerceRows(parsed: unknown): EquipmentRecord[] | null {
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? ((parsed as Record<string, unknown>).equipment ??
        (parsed as Record<string, unknown>).records ??
        (parsed as Record<string, unknown>).rows)
      : null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0] as Record<string, unknown>;
  if (typeof first.equipmentno !== "string" || typeof first.stationcomplexid === "undefined") return null;
  return rows as EquipmentRecord[];
}

let cached: { path: string; rows: EquipmentRecord[] } | null = null;

/**
 * Reads the equipment master. Prefers `data/equipment.json` (data agent output);
 * falls back to the checked-in sample so the routing graph builds standalone.
 */
export function loadEquipment(): { rows: EquipmentRecord[]; path: string; source: string } {
  if (cached) return { ...cached, source: EQUIPMENT_SOURCE };
  const rows = coerceRows(equipmentMaster as unknown);
  if (!rows) {
    throw new Error(`equipment master at ${EQUIPMENT_PATH} has an unexpected shape. Fetch it from ${EQUIPMENT_SOURCE}`);
  }
  cached = { path: EQUIPMENT_PATH, rows };
  return { rows, path: EQUIPMENT_PATH, source: EQUIPMENT_SOURCE };
}

/** An active ADA elevator: the only equipment class the accessible graph is built from. */
export function isAdaElevator(r: EquipmentRecord): boolean {
  return r.equipmenttype === "EL" && r.ADA === "Y" && r.isactive === "Y";
}

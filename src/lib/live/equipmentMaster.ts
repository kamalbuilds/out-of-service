/**
 * Loads the MTA elevator/escalator equipment master, used by join.ts for
 * station/stop enrichment.
 *
 * Preferred source: `data/equipment.json`, committed to the repo by the
 * data-index agent (a SODA/GTFS pull it already does for the historical
 * reliability index). If that file does not exist yet, this module falls
 * back to fetching the live equipment-master feed itself, cached in memory
 * for 1 hour (this feed changes far less often than the outage feed).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EquipmentMasterRecord } from "./join";

const EQUIPMENT_MASTER_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json";

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const DATA_FILE_PATH = path.join(process.cwd(), "data", "equipment.json");

interface CacheState {
  records: EquipmentMasterRecord[];
  fetchedAtMs: number;
}

let cache: CacheState | null = null;

async function readCommittedFile(): Promise<EquipmentMasterRecord[] | null> {
  try {
    const raw = await readFile(DATA_FILE_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data as EquipmentMasterRecord[];
    // Allow either a bare array or an envelope with a `records`/`equipment` key.
    if (Array.isArray(data?.records)) return data.records as EquipmentMasterRecord[];
    if (Array.isArray(data?.equipment)) return data.equipment as EquipmentMasterRecord[];
    return null;
  } catch {
    return null;
  }
}

async function fetchLive(): Promise<EquipmentMasterRecord[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(EQUIPMENT_MASTER_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`MTA equipment master feed responded ${res.status}`);
    }
    const data = (await res.json()) as EquipmentMasterRecord[];
    if (!Array.isArray(data)) {
      throw new Error("MTA equipment master feed returned a non-array payload");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns the equipment master records. Checks for the data agent's
 * committed `data/equipment.json` on every call (cheap local read, always
 * fresh if that file is updated by a rebuild); falls back to a 1h-cached
 * live fetch when it is absent.
 */
export async function getEquipmentMaster(): Promise<EquipmentMasterRecord[]> {
  const committed = await readCommittedFile();
  if (committed) return committed;

  const now = Date.now();
  if (cache && now - cache.fetchedAtMs < CACHE_TTL_MS) {
    return cache.records;
  }

  try {
    const records = await fetchLive();
    cache = { records, fetchedAtMs: now };
    return records;
  } catch (err) {
    if (cache) return cache.records;
    throw err instanceof Error
      ? err
      : new Error("Failed to fetch MTA equipment master and no cache available");
  }
}

/** Test-only: reset the module-scope cache between test cases. */
export function __resetEquipmentMasterCacheForTests(): void {
  cache = null;
}

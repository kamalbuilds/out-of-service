/**
 * Live MTA elevator/escalator outage feed.
 *
 * Source: MTA "Elevator/Escalator Info" open dataset (keyless, public JSON).
 * https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json
 *
 * Caveat: the in-memory cache below is module-scope state. On Vercel it only
 * survives for the lifetime of a warm serverless/Fluid Compute instance --
 * concurrent instances each keep their own cache, and a cold start always
 * refetches. This is fine for a 60s TTL used purely to avoid hammering the
 * upstream feed; it is NOT a substitute for a shared cache (Redis/KV) if
 * this ever needs cross-instance consistency.
 */

const OUTAGES_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json";

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;

export type EquipmentType = "EL" | "ES";

/**
 * Minimal local type for a single normalised outage record.
 *
 * If `src/lib/index/` (owned by another agent) exports a matching
 * `EquipmentCode` / equipment-index type, prefer importing that for the
 * `equipmentCode` field's type instead of `string`. As of writing,
 * `src/lib/index/` exists but is empty, so no such export is available yet
 * and this file defines its own type rather than importing from a module
 * with no exports.
 */
export interface LiveOutage {
  /** Normalised join key, e.g. "EL131". Trimmed, uppercased, spaces removed. */
  equipmentCode: string;
  equipmentType: EquipmentType;
  station: string;
  borough: string;
  /** trainno split on "/", e.g. "B/D/4" -> ["B", "D", "4"] */
  lines: string[];
  serving: string;
  ada: boolean;
  /** ISO 8601 UTC instant, parsed from the MM/DD/YYYY hh:mm:ss AM/PM America/New_York string. */
  outageStart: string;
  /** ISO 8601 UTC instant, or null if the feed gave no estimate. */
  estimatedReturn: string | null;
  reason: string;
  isUpcoming: boolean;
  isMaintenance: boolean;
  /** true once outageStart has passed and it is not flagged as upcoming. */
  isCurrent: boolean;
  /** Hours elapsed since outageStart (now - outageStart), negative if in the future. */
  hoursOut: number;
}

export interface LiveOutagesEnvelope {
  fetchedAt: string;
  sourceUrl: string;
  stale: boolean;
  outages: LiveOutage[];
}

interface RawOutageRecord {
  station: string;
  borough: string;
  trainno: string;
  equipment: string;
  equipmenttype: string;
  serving: string;
  ADA: string;
  outagedate: string;
  estimatedreturntoservice: string;
  reason: string;
  isupcomingoutage: string;
  ismaintenanceoutage: string;
}

/**
 * Parse "MM/DD/YYYY hh:mm:ss AM/PM" as wall-clock time in America/New_York
 * and return the equivalent UTC instant as an ISO string.
 *
 * DST handling: America/New_York's UTC offset is -05:00 (EST) or -04:00
 * (EDT) depending on the date. Rather than hardcode the DST transition
 * rule (which the US Congress can and has changed), we ask the platform's
 * ICU timezone database what the offset is for the given calendar date via
 * Intl.DateTimeFormat, then convert. This is correct for all instants
 * except the ~1 hour of wall-clock time that is skipped (spring-forward)
 * or repeated (fall-back) on the two DST transition days each year, which
 * is an inherent ambiguity in any "local wall clock -> UTC" conversion and
 * not something the MTA feed's precision requires us to resolve.
 */
function parseNyDateToIso(value: string): string | null {
  if (!value) return null;
  const match = value
    .trim()
    .match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i,
    );
  if (!match) return null;

  const [, mm, dd, yyyy, hh12, min, sec, ampm] = match;
  let hour = parseInt(hh12, 10) % 12;
  if (ampm.toUpperCase() === "PM") hour += 12;

  const year = parseInt(yyyy, 10);
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  const minute = parseInt(min, 10);
  const second = parseInt(sec, 10);

  // First guess: treat the wall-clock numbers as if they were UTC.
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = nyOffsetMinutesAt(guessUtcMs);
  // Real UTC instant = wall-clock time minus the (negative) NY offset.
  let realUtcMs = guessUtcMs - offsetMinutes * 60_000;

  // Re-derive the offset at the corrected instant in case the first guess
  // landed on the wrong side of a DST boundary (rare, only possible for
  // instants within ~5 hours of a transition).
  const offsetMinutes2 = nyOffsetMinutesAt(realUtcMs);
  if (offsetMinutes2 !== offsetMinutes) {
    realUtcMs = guessUtcMs - offsetMinutes2 * 60_000;
  }

  return new Date(realUtcMs).toISOString();
}

const nyOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeZoneName: "longOffset",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Returns America/New_York's UTC offset, in minutes (negative), at the given UTC instant. */
function nyOffsetMinutesAt(utcMs: number): number {
  const parts = nyOffsetFormatter.formatToParts(new Date(utcMs));
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  const m = tzPart.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return -300;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = parseInt(m[2], 10);
  const mins = parseInt(m[3], 10);
  return sign * (hours * 60 + mins);
}

function normaliseEquipmentCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function normaliseRecord(raw: RawOutageRecord, now: Date): LiveOutage {
  const outageStart = parseNyDateToIso(raw.outagedate) ?? new Date(0).toISOString();
  const estimatedReturn = parseNyDateToIso(raw.estimatedreturntoservice);
  const isUpcoming = raw.isupcomingoutage?.trim().toUpperCase() === "Y";
  const isMaintenance = raw.ismaintenanceoutage?.trim().toUpperCase() === "Y";
  const startMs = new Date(outageStart).getTime();
  const isCurrent = startMs <= now.getTime() && !isUpcoming;
  const hoursOut = (now.getTime() - startMs) / (1000 * 60 * 60);

  return {
    equipmentCode: normaliseEquipmentCode(raw.equipment ?? ""),
    equipmentType: (raw.equipmenttype?.trim().toUpperCase() as EquipmentType) ?? "EL",
    station: raw.station ?? "",
    borough: raw.borough ?? "",
    lines: (raw.trainno ?? "").split("/").map((s) => s.trim()).filter(Boolean),
    serving: raw.serving ?? "",
    ada: raw.ADA?.trim().toUpperCase() === "Y",
    outageStart,
    estimatedReturn,
    reason: raw.reason ?? "",
    isUpcoming,
    isMaintenance,
    isCurrent,
    hoursOut,
  };
}

interface CacheState {
  envelope: LiveOutagesEnvelope;
  fetchedAtMs: number;
}

let cache: CacheState | null = null;

async function fetchRaw(): Promise<RawOutageRecord[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(OUTAGES_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`MTA outage feed responded ${res.status}`);
    }
    const data = (await res.json()) as RawOutageRecord[];
    if (!Array.isArray(data)) {
      throw new Error("MTA outage feed returned a non-array payload");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the live outage feed, normalised, with a 60s in-memory cache.
 * If a fresh fetch fails and a cached copy exists (even if expired), the
 * cached copy is returned with `stale: true` rather than throwing.
 */
export async function fetchLiveOutages(): Promise<LiveOutagesEnvelope> {
  const now = Date.now();

  if (cache && now - cache.fetchedAtMs < CACHE_TTL_MS) {
    return cache.envelope;
  }

  try {
    const raw = await fetchRaw();
    const nowDate = new Date();
    const envelope: LiveOutagesEnvelope = {
      fetchedAt: nowDate.toISOString(),
      sourceUrl: OUTAGES_URL,
      stale: false,
      outages: raw.map((r) => normaliseRecord(r, nowDate)),
    };
    cache = { envelope, fetchedAtMs: now };
    return envelope;
  } catch (err) {
    if (cache) {
      return { ...cache.envelope, stale: true };
    }
    throw err instanceof Error
      ? err
      : new Error("Failed to fetch MTA outage feed and no cache available");
  }
}

/** Test-only: reset the module-scope cache between test cases. */
export function __resetLiveOutagesCacheForTests(): void {
  cache = null;
}

export { parseNyDateToIso, normaliseEquipmentCode };

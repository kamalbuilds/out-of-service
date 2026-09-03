import {
  getEquipment,
  getStationEquipment,
  listStations,
  resolveStation,
  scoreStation,
  toElevatorRef,
} from "@/lib/adapters/stations";
import { liveSnapshotOrEmpty } from "@/lib/adapters/live";
import { EQUIPMENT_DATASET } from "@/lib/adapters/sources";
import type { StationSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The tool layer's contract calls the id `complexId`; the UI calls it `id`. Serve both. */
function wire(s: StationSummary, outNow: number) {
  return { ...s, complexId: s.id, stopIds: s.gtfsStopIds, outNow };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim().toLowerCase() ?? "";
  const line = params.get("line")?.trim().toUpperCase() ?? "";
  const limitRaw = Number(params.get("limit"));
  const station = params.get("station")?.trim() ?? "";
  const equipment = params.get("equipment")?.trim().toUpperCase() ?? "";

  try {
    const live = await liveSnapshotOrEmpty();
    const outByCode = new Map(live.outages.filter((o) => o.isCurrent).map((o) => [o.equipmentCode, o]));
    const source = { ...EQUIPMENT_DATASET, rows: 0 };

    if (equipment) {
      const e = getEquipment(equipment);
      if (!e) {
        return Response.json(
          { error: `No equipment with code "${equipment}" in the MTA equipment master.` },
          { status: 404 },
        );
      }
      const ref = toElevatorRef(e, outByCode.get(e.equipment_code));
      return Response.json({
        equipment: ref,
        source: ref.source,
        fetchedAt: live.fetchedAt,
      });
    }

    const all = listStations();

    if (station) {
      const match = resolveStation(station, all);
      if (!match) {
        return Response.json({ error: `No accessible station matches "${station}".` }, { status: 404 });
      }
      const rows = getStationEquipment(match.id);
      const elevators = rows.map((e) => toElevatorRef(e, outByCode.get(e.equipment_code)));
      const codes = new Set(rows.map((e) => e.equipment_code));
      const outages = live.outages.filter((o) => codes.has(o.equipmentCode));
      return Response.json({
        station: wire(match, outages.filter((o) => o.isCurrent).length),
        elevators,
        outages,
        score: scoreStation(match.id),
        source: { ...EQUIPMENT_DATASET, rows: rows.length },
        fetchedAt: live.fetchedAt,
      });
    }

    let rows = all;
    if (q) {
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase() === q ||
          s.gtfsStopIds.some((g) => g.toLowerCase() === q),
      );
    }
    if (line) rows = rows.filter((s) => s.lines.some((l) => l.toUpperCase() === line));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, limitRaw) : rows.length;

    const outByStation = new Map<string, number>();
    for (const o of live.outages) {
      if (!o.isCurrent) continue;
      const key = o.stationComplexId ?? o.gtfsStopId ?? o.station;
      outByStation.set(key, (outByStation.get(key) ?? 0) + 1);
    }

    return Response.json({
      stations: rows.slice(0, limit).map((s) => wire(s, outByStation.get(s.id) ?? 0)),
      count: Math.min(limit, rows.length),
      total: all.length,
      source: { ...source, rows: all.length },
      fetchedAt: live.fetchedAt,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 });
  }
}

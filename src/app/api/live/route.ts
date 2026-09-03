import { NextRequest, NextResponse } from "next/server";
import { fetchLiveOutages } from "@/lib/live/mta";
import { getEquipmentMaster } from "@/lib/live/equipmentMaster";
import { joinLiveWithMaster, type JoinedOutage } from "@/lib/live/join";

export const dynamic = "force-dynamic";

function matchesStation(outage: JoinedOutage, station: string): boolean {
  const needle = station.trim().toUpperCase();
  return (
    outage.stationComplexId?.toUpperCase() === needle ||
    outage.gtfsStopId?.toUpperCase() === needle
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stationParam = searchParams.get("station");
  const equipmentParam = searchParams.get("equipment");

  const [liveEnvelope, equipmentMaster] = await Promise.all([
    fetchLiveOutages(),
    getEquipmentMaster(),
  ]);

  const { outages, coverage } = joinLiveWithMaster(liveEnvelope.outages, equipmentMaster);

  let filtered = outages;

  if (equipmentParam) {
    const code = equipmentParam.trim().toUpperCase().replace(/\s+/g, "");
    const match = outages.find((o) => o.equipmentCode === code);
    return NextResponse.json(
      {
        fetchedAt: liveEnvelope.fetchedAt,
        stale: liveEnvelope.stale,
        sourceUrl: liveEnvelope.sourceUrl,
        coverage,
        outage: match ?? null,
      },
      {
        status: match ? 200 : 404,
        headers: { "Cache-Control": "s-maxage=60" },
      },
    );
  }

  if (stationParam) {
    filtered = outages.filter((o) => matchesStation(o, stationParam));
  }

  const counts = {
    current: filtered.filter((o) => o.isCurrent).length,
    upcoming: filtered.filter((o) => o.isUpcoming).length,
    elevators: filtered.filter((o) => o.equipmentType === "EL").length,
    escalators: filtered.filter((o) => o.equipmentType === "ES").length,
    adaCurrent: filtered.filter((o) => o.isCurrent && o.ada).length,
  };

  return NextResponse.json(
    {
      fetchedAt: liveEnvelope.fetchedAt,
      stale: liveEnvelope.stale,
      sourceUrl: liveEnvelope.sourceUrl,
      coverage,
      counts,
      outages: filtered,
    },
    { headers: { "Cache-Control": "s-maxage=60" } },
  );
}

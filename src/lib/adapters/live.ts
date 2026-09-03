/**
 * Server-side read of the live MTA outage feed through the live agent's
 * module, shaped exactly like the JSON `GET /api/live` returns so the server
 * and the browser render from one type.
 */
import { getEquipmentMaster } from "@/lib/live/equipmentMaster";
import { joinLiveWithMaster } from "@/lib/live/join";
import { fetchLiveOutages } from "@/lib/live/mta";
import type { LiveSnapshot } from "@/lib/types";

export async function liveSnapshot(): Promise<LiveSnapshot> {
  const [envelope, master] = await Promise.all([fetchLiveOutages(), getEquipmentMaster()]);
  const { outages, coverage } = joinLiveWithMaster(envelope.outages, master);
  return {
    fetchedAt: envelope.fetchedAt,
    sourceUrl: envelope.sourceUrl,
    stale: envelope.stale,
    coverage,
    counts: {
      current: outages.filter((o) => o.isCurrent).length,
      upcoming: outages.filter((o) => o.isUpcoming).length,
      elevators: outages.filter((o) => o.equipmentType === "EL").length,
      escalators: outages.filter((o) => o.equipmentType === "ES").length,
      adaCurrent: outages.filter((o) => o.isCurrent && o.ada).length,
    },
    outages,
  };
}

const EMPTY: LiveSnapshot = {
  fetchedAt: new Date(0).toISOString(),
  sourceUrl: "",
  stale: true,
  coverage: 0,
  counts: { current: 0, upcoming: 0, elevators: 0, escalators: 0, adaCurrent: 0 },
  outages: [],
};

export async function liveSnapshotOrEmpty(): Promise<LiveSnapshot> {
  try {
    return await liveSnapshot();
  } catch {
    return { ...EMPTY, fetchedAt: new Date().toISOString() };
  }
}

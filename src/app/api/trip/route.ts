import { findRoutes } from "@/lib/adapters/routes";
import { liveSnapshotOrEmpty } from "@/lib/adapters/live";
import { listStations, resolveStation } from "@/lib/adapters/stations";
import { parseConstraints } from "@/lib/adapters/input";
import { createTrip, stripKeys } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const from = String(body.from ?? "").trim();
  const to = String(body.to ?? "").trim();
  if (!from || !to) {
    return Response.json(
      { error: "Pick a station to start from and a station to travel to." },
      { status: 400 },
    );
  }

  try {
    const stations = listStations();
    const fromStation = resolveStation(from, stations);
    const toStation = resolveStation(to, stations);
    if (!fromStation) {
      return Response.json({ error: `No accessible station matches "${from}".` }, { status: 400 });
    }
    if (!toStation) {
      return Response.json({ error: `No accessible station matches "${to}".` }, { status: 400 });
    }
    if (fromStation.id === toStation.id) {
      return Response.json(
        { error: "Origin and destination are the same station." },
        { status: 400 },
      );
    }

    const constraints = parseConstraints(body.constraints);
    const live = await liveSnapshotOrEmpty();
    const { routes: candidates, notes, source } = findRoutes(fromStation.id, toStation.id, constraints, live);

    const trip = await createTrip({
      from: fromStation.id,
      to: toStation.id,
      fromName: fromStation.name,
      toName: toStation.name,
      constraints,
      candidates,
    });

    // The one-time exception: the creator's own response carries both capability
    // keys and the two ready-to-share URLs. Every later read of this trip (GET,
    // SSE, tool results) strips both keys.
    return Response.json(
      {
        trip: stripKeys(trip),
        riderKey: trip.riderKey,
        companionKey: trip.companionKey,
        riderUrl: `/t/${trip.id}?k=${trip.riderKey}`,
        companionUrl: `/t/${trip.id}?k=${trip.companionKey}`,
        notes,
        source,
      },
      { status: 201 },
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 });
  }
}

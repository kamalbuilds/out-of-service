import { findRoutes } from "@/lib/adapters/routes";
import { liveSnapshotOrEmpty } from "@/lib/adapters/live";
import { listStations, resolveStation } from "@/lib/adapters/stations";
import { parseConstraints } from "@/lib/adapters/input";

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
      { error: "Both `from` and `to` are required: a station name, a complex id, or a GTFS stop id." },
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
      return Response.json({ error: "Origin and destination are the same station." }, { status: 400 });
    }

    const constraints = parseConstraints(body.constraints);
    const live = await liveSnapshotOrEmpty();
    const routes = await findRoutes(fromStation.id, toStation.id, constraints, live);

    return Response.json({
      from: fromStation,
      to: toStation,
      constraints,
      routes,
      fetchedAt: live.fetchedAt,
      sourceUrl: live.sourceUrl,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 });
  }
}

import { listStations } from "@/lib/adapters/stations";
import { EQUIPMENT_DATASET } from "@/lib/adapters/sources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  try {
    const all = listStations();
    const rows = q
      ? all.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.lines.some((l) => l.toLowerCase() === q) ||
            s.id.toLowerCase() === q,
        )
      : all;
    return Response.json({
      stations: rows,
      count: rows.length,
      total: all.length,
      source: { ...EQUIPMENT_DATASET, rows: all.length },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 });
  }
}

import { getTrip } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/trip/[id]">) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return Response.json({ error: `No trip with id "${id}".` }, { status: 404 });
  }
  return Response.json({ trip });
}

import { getTrip, stripKeys } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/trip/[id]">) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return Response.json({ error: `No trip with id "${id}".` }, { status: 404 });
  }
  // This is an unauthenticated read: the trip id alone is not a secret (it is in
  // both the rider and companion URL), so both capability keys are stripped here.
  return Response.json({ trip: stripKeys(trip) });
}

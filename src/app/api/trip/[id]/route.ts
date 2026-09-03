import { getTrip, stripKeysAndSpotlight } from "@/lib/store";
import { PRIVATE_NO_STORE } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/trip/[id]">) {
  const { id } = await ctx.params;
  const trip = await getTrip(id);
  if (!trip) {
    return Response.json({ error: `No trip with id "${id}".` }, { status: 404, headers: PRIVATE_NO_STORE });
  }
  // This is an unauthenticated read: the trip id alone is not a secret (it is in both the rider
  // and companion URL), so both capability keys are stripped here. Free text (notes, report
  // descriptions, reroute reasons) gets the same spotlighting the get_trip WebMCP tool applies,
  // so a caller reading this over plain fetch() sees the identical untrusted-content boundary —
  // see docs/WEBMCP.md's Security section. Never cached or stored: it's another person's trip.
  return Response.json({ trip: stripKeysAndSpotlight(trip) }, { headers: PRIVATE_NO_STORE });
}

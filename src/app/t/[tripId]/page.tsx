import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrip, stripKeys } from "@/lib/store";
import { roleForKey } from "@/lib/store/actions";
import { TripProvider } from "@/components/trip/TripProvider";
import { TripView } from "@/components/trip/TripView";
import { InvalidLink } from "@/components/trip/InvalidLink";

export const dynamic = "force-dynamic";

function keyFrom(sp: Awaited<PageProps<"/t/[tripId]">["searchParams"]>): string {
  const raw = sp.k;
  return String(Array.isArray(raw) ? raw[0] : (raw ?? "")).trim();
}

/** Two open tabs on the same trip must be tellable apart from the tab strip alone. */
export async function generateMetadata({ params, searchParams }: PageProps<"/t/[tripId]">): Promise<Metadata> {
  const { tripId } = await params;
  const sp = await searchParams;
  const trip = await getTrip(tripId);
  if (!trip) return { title: "Out of Service: no trip at this link" };
  const view = roleForKey(trip, keyFrom(sp)) ?? "invalid link";
  return {
    title: `Out of Service: ${trip.fromName} to ${trip.toName}, ${view} view`,
    description: `A step-free trip from ${trip.fromName} to ${trip.toName}, scored on the outage history of the elevators it depends on.`,
  };
}

export default async function TripPage({ params, searchParams }: PageProps<"/t/[tripId]">) {
  const { tripId } = await params;
  const sp = await searchParams;
  const demo = sp.demo === "1" || process.env.DEMO_OVERRIDES === "1";

  const trip = await getTrip(tripId);
  if (!trip) notFound();

  const key = keyFrom(sp);
  const role = roleForKey(trip, key);
  // `role=` in the query is a harmless display hint only now; it decides nothing.
  // Authority comes entirely from `k`, checked server-side against the trip's own
  // capability keys, so a wrong or missing key can never be upgraded by wishing.
  if (!role) {
    return <InvalidLink />;
  }

  // The rider is the only session handed the companion key, and only because the
  // server just proved they hold the rider key: CompanionLink and share_trip need
  // it to hand out a working companion URL. It never reaches GET, SSE, or a tool
  // result for anyone else.
  const companionKeyForRider = role === "rider" ? trip.companionKey : undefined;

  return (
    <TripProvider
      tripId={tripId}
      role={role}
      sessionKey={key}
      companionKey={companionKeyForRider}
      initialTrip={stripKeys(trip)}
      demo={demo}
    >
      <TripView />
    </TripProvider>
  );
}

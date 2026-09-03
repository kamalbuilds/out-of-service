import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrip } from "@/lib/store";
import { TripProvider } from "@/components/trip/TripProvider";
import { TripView } from "@/components/trip/TripView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Two open tabs on the same trip must be tellable apart from the tab strip alone. */
export async function generateMetadata({ params, searchParams }: PageProps<"/t/[tripId]">): Promise<Metadata> {
  const { tripId } = await params;
  const sp = await searchParams;
  const trip = await getTrip(tripId);
  if (!trip) return { title: "Out of Service: no trip at this link" };
  const view = sp.role === "companion" ? "companion" : "rider";
  return {
    title: `Out of Service: ${trip.fromName} to ${trip.toName}, ${view} view`,
    description: `A step-free trip from ${trip.fromName} to ${trip.toName}, scored on the outage history of the elevators it depends on.`,
  };
}

export default async function TripPage({ params, searchParams }: PageProps<"/t/[tripId]">) {
  const { tripId } = await params;
  const sp = await searchParams;
  const role: Role = sp.role === "companion" ? "companion" : "rider";
  const demo = sp.demo === "1" || process.env.DEMO_OVERRIDES === "1";

  const trip = await getTrip(tripId);
  if (!trip) notFound();

  return (
    <TripProvider tripId={tripId} role={role} initialTrip={trip} demo={demo}>
      <TripView />
    </TripProvider>
  );
}

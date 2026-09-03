import { notFound } from "next/navigation";
import { getTrip } from "@/lib/store";
import { TripProvider } from "@/components/trip/TripProvider";
import { TripView } from "@/components/trip/TripView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

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

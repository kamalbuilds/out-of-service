"use client";

import { useRouter } from "next/navigation";
import { CreateTripForm } from "@/components/webmcp/CreateTripForm";
import type { CreateTripInput, Trip } from "@/lib/types";

/**
 * The declarative half of the home page: the webmcp agent's `<form toolname="create_trip">`.
 * The browser registers it as a tool from the markup, an agent fills the fields, and a human
 * presses Create. There is no `toolautosubmit` anywhere in this app.
 */
export function AgentCreateTrip() {
  const router = useRouter();
  return (
    <CreateTripForm
      createTrip={async (input: CreateTripInput) => {
        const res = await fetch("/api/trip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json()) as { trip?: Trip; error?: string };
        if (!res.ok || !body.trip) {
          throw new Error(body.error ?? `The server returned HTTP ${res.status}.`);
        }
        return body.trip;
      }}
      onCreated={(trip) => router.push(`/t/${trip.id}`)}
    />
  );
}

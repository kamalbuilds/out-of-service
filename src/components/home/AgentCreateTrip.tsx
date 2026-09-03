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
        const body = (await res.json()) as {
          trip?: Trip;
          riderUrl?: string;
          companionUrl?: string;
          companionKey?: string;
          error?: string;
        };
        if (!res.ok || !body.trip || !body.riderUrl || !body.companionUrl) {
          throw new Error(body.error ?? `The server returned HTTP ${res.status}.`);
        }
        if (body.companionKey) {
          try {
            sessionStorage.setItem(`oos:companionKey:${body.trip.id}`, body.companionKey);
          } catch {
            /* storage unavailable */
          }
        }
        return { trip: body.trip, riderUrl: body.riderUrl, companionUrl: body.companionUrl };
      }}
      onCreated={({ riderUrl }) => router.push(riderUrl)}
    />
  );
}

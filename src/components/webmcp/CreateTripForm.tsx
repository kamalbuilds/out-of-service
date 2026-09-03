"use client";

import { useEffect, useState } from "react";
import type { CreateTripInput, Trip } from "@/lib/webmcp/contracts";
import styles from "./tool-form.module.css";

const TOOL_NAME = "create_trip";
const TOOL_DESCRIPTION =
  "Start a shared accessible trip between two NYC subway stations with the rider's constraints. Returns the trip id and a companion link. The rider reviews the filled fields and presses Create; this form is never submitted automatically.";

/**
 * The home page's declarative tool. Same rules as ReportForm: no `toolautosubmit`, and the
 * agent's result comes back through `SubmitEvent.respondWith()` rather than a navigation.
 */
export function CreateTripForm({
  createTrip,
  onCreated,
}: {
  createTrip: (input: CreateTripInput) => Promise<Trip>;
  onCreated?: (trip: Trip) => void;
}) {
  const [agentFilled, setAgentFilled] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const onActivated = (event: Event) => {
      if ((event as Event & { toolName?: string }).toolName === TOOL_NAME) setAgentFilled(true);
    };
    const onCancel = (event: Event) => {
      if ((event as Event & { toolName?: string }).toolName === TOOL_NAME) setAgentFilled(false);
    };
    window.addEventListener("toolactivated", onActivated);
    window.addEventListener("toolcancel", onCancel);
    return () => {
      window.removeEventListener("toolactivated", onActivated);
      window.removeEventListener("toolcancel", onCancel);
    };
  }, []);

  async function create(form: HTMLFormElement): Promise<{ trip: Trip; result: Record<string, unknown> }> {
    const data = new FormData(form);
    const from = String(data.get("from") ?? "").trim();
    const to = String(data.get("to") ?? "").trim();
    if (!from || !to) throw new Error("Both from and to are required.");
    if (from.toLowerCase() === to.toLowerCase()) throw new Error("from and to are the same station.");
    const maxTransfersRaw = Number(data.get("maxTransfers"));
    const trip = await createTrip({
      from,
      to,
      constraints: {
        wheelchair: data.get("wheelchair") !== null,
        avoidEscalators: data.get("avoidEscalators") !== null,
        maxTransfers: Number.isFinite(maxTransfersRaw) ? maxTransfersRaw : 2,
      },
    });
    return {
      trip,
      result: {
        tripId: trip.id,
        from: trip.fromName,
        to: trip.toName,
        candidateCount: trip.candidates.length,
        companionUrl: `${window.location.origin}/t/${trip.id}?role=companion`,
        note: "Open the companion link in a second window to give a travelling companion their own, smaller tool set.",
      },
    };
  }

  return (
    <form
      toolname={TOOL_NAME}
      tooldescription={TOOL_DESCRIPTION}
      className={`${styles.toolForm} ${agentFilled ? styles.agentFilled : ""} p-3`}
      onSubmit={(event) => {
        const native = event.nativeEvent as SubmitEvent;
        event.preventDefault();
        const form = event.currentTarget;
        const done = create(form).then(
          ({ trip, result }) => {
            setAgentFilled(false);
            setStatus(`Trip ${trip.id} created.`);
            onCreated?.(trip);
            return result;
          },
          (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            setStatus(message);
            throw new Error(`The trip was not created: ${message}`);
          }
        );
        if (native.agentInvoked && native.respondWith) native.respondWith(done);
        else void done.catch(() => undefined);
      }}
    >
      <h2 className="font-mono text-xs uppercase tracking-[0.2em]">Plan an accessible trip</h2>

      <label className="mt-2 block text-sm font-bold">
        From
        <input
          name="from"
          required
          toolparamdescription='Origin station name or complex id, e.g. "Jay St-MetroTech". Use list_accessible_stations to resolve a spoken name first.'
          placeholder="Jay St-MetroTech"
          className="mt-1 block w-full border-2 border-black px-2 py-2 text-base"
        />
      </label>

      <label className="mt-2 block text-sm font-bold">
        To
        <input
          name="to"
          required
          toolparamdescription='Destination station name or complex id, e.g. "14 St-Union Sq".'
          placeholder="14 St-Union Sq"
          className="mt-1 block w-full border-2 border-black px-2 py-2 text-base"
        />
      </label>

      <fieldset className="mt-3 border-2 border-black p-2">
        <legend className="px-1 font-mono text-xs uppercase tracking-wide">Constraints</legend>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            name="wheelchair"
            defaultChecked
            toolparamdescription="Check when the rider needs a fully step-free path, elevators only."
            className="h-5 w-5 accent-black"
          />
          Step-free the whole way
        </label>
        <label className="mt-1 flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            name="avoidEscalators"
            toolparamdescription="Check when escalators are not an acceptable substitute for an elevator."
            className="h-5 w-5 accent-black"
          />
          No escalators
        </label>
        <label className="mt-2 block text-sm font-bold">
          Most transfers
          <input
            type="number"
            name="maxTransfers"
            min={0}
            max={4}
            defaultValue={2}
            toolparamdescription="The most transfers the rider will accept, 0 to 4."
            className="mt-1 block w-24 border-2 border-black px-2 py-1 font-mono text-base"
          />
        </label>
      </fieldset>

      <button
        type="submit"
        className={`${styles.submit} mt-3 w-full bg-black px-4 py-3 text-lg font-bold uppercase tracking-wide text-white`}
      >
        Create trip
      </button>

      {status && <p className="mt-2 font-mono text-xs">{status}</p>}
    </form>
  );
}

export default CreateTripForm;

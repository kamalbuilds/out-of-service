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
export type CreateTripResult = { trip: Trip; riderUrl: string; companionUrl: string };

export function CreateTripForm({
  createTrip,
  onCreated,
}: {
  createTrip: (input: CreateTripInput) => Promise<CreateTripResult>;
  onCreated?: (result: CreateTripResult) => void;
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

  async function create(form: HTMLFormElement): Promise<{ result: CreateTripResult; toolResult: Record<string, unknown> }> {
    const data = new FormData(form);
    const from = String(data.get("from") ?? "").trim();
    const to = String(data.get("to") ?? "").trim();
    if (!from || !to) throw new Error("Both from and to are required.");
    if (from.toLowerCase() === to.toLowerCase()) throw new Error("from and to are the same station.");
    const maxTransfersRaw = Number(data.get("maxTransfers"));
    const result = await createTrip({
      from,
      to,
      constraints: {
        wheelchair: data.get("wheelchair") !== null,
        avoidEscalators: data.get("avoidEscalators") !== null,
        maxTransfers: Number.isFinite(maxTransfersRaw) ? maxTransfersRaw : 2,
      },
    });
    const { trip } = result;
    return {
      result,
      toolResult: {
        tripId: trip.id,
        from: trip.fromName,
        to: trip.toName,
        candidateCount: trip.candidates.length,
        companionUrl: `${window.location.origin}${result.companionUrl}`,
        note: "Open the companion link in a second window to give a travelling companion their own, smaller tool set. The link carries the companion's capability key; it is shown once, here.",
      },
    };
  }

  return (
    <form
      toolname={TOOL_NAME}
      tooldescription={TOOL_DESCRIPTION}
      className={`${styles.toolForm} ${agentFilled ? styles.agentFilled : ""} p-4`}
      onSubmit={(event) => {
        const native = event.nativeEvent as SubmitEvent;
        event.preventDefault();
        const form = event.currentTarget;
        const done = create(form).then(
          ({ result, toolResult }) => {
            setAgentFilled(false);
            setStatus(`Trip ${result.trip.id} created.`);
            onCreated?.(result);
            return toolResult;
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
      <h2 className="colhead">Plan an accessible trip</h2>

      <label className="mt-3 block text-[0.8125rem] font-semibold">
        From
        <input
          name="from"
          required
          toolparamdescription='Origin station name or complex id, e.g. "Jay St-MetroTech". Use list_accessible_stations to resolve a spoken name first.'
          placeholder="Jay St-MetroTech"
          className="mt-1 block w-full rounded-control border border-hair-strong bg-paper px-2.5 py-2 text-[0.9375rem] font-normal focus:border-accent"
        />
      </label>

      <label className="mt-3 block text-[0.8125rem] font-semibold">
        To
        <input
          name="to"
          required
          toolparamdescription='Destination station name or complex id, e.g. "14 St-Union Sq".'
          placeholder="14 St-Union Sq"
          className="mt-1 block w-full rounded-control border border-hair-strong bg-paper px-2.5 py-2 text-[0.9375rem] font-normal focus:border-accent"
        />
      </label>

      <fieldset className="mt-3 border border-hair-strong p-2.5">
        <legend className="colhead px-1">Constraints</legend>
        <label className="flex items-center gap-2 text-[0.8125rem] font-medium">
          <input
            type="checkbox"
            name="wheelchair"
            defaultChecked
            toolparamdescription="Check when the rider needs a fully step-free path, elevators only."
            className="h-4 w-4 accent-accent"
          />
          Step-free the whole way
        </label>
        <label className="mt-2 flex items-center gap-2 text-[0.8125rem] font-medium">
          <input
            type="checkbox"
            name="avoidEscalators"
            toolparamdescription="Check when escalators are not an acceptable substitute for an elevator."
            className="h-4 w-4 accent-accent"
          />
          No escalators
        </label>
        <label className="mt-3 block text-[0.8125rem] font-semibold">
          Most transfers
          <input
            type="number"
            name="maxTransfers"
            min={0}
            max={4}
            defaultValue={2}
            toolparamdescription="The most transfers the rider will accept, 0 to 4."
            className="num mt-1 block w-24 rounded-control border border-hair-strong bg-paper px-2 py-1.5 text-[0.9375rem] font-normal focus:border-accent"
          />
        </label>
      </fieldset>

      <button
        type="submit"
        className={`${styles.submit} mt-4 w-full rounded-control bg-accent px-4 py-2.5 text-[0.9375rem] font-semibold text-paper transition-transform duration-150 active:scale-[0.97]`}
      >
        Create trip
      </button>

      {status && <p className="code mt-2 text-[0.6875rem]" aria-live="polite">{status}</p>}
    </form>
  );
}

export default CreateTripForm;

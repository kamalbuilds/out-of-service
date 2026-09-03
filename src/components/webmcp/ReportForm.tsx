"use client";

import { useEffect, useState } from "react";
import type { TripActions } from "@/lib/webmcp/contracts";
import styles from "./tool-form.module.css";

const TOOL_NAME = "report_broken_equipment";
const TOOL_DESCRIPTION =
  "File a broken-equipment report against this trip: which elevator or escalator, what happened, and roughly when. The rider reads the filled form and presses Send; it is never submitted automatically.";

/**
 * The declarative half of the demo: a real <form> carrying `toolname` / `tooldescription` /
 * `toolparamdescription`. The browser synthesises the input schema from the controls and
 * registers the tool itself, so there is no registerTool call here.
 *
 * There is deliberately NO `toolautosubmit`. Without it the agent fills the fields, the browser
 * focuses the submit button, and a human has to press it. That is WebMCP's built-in
 * human-in-the-loop for declarative tools, and filing a maintenance report against real MTA
 * equipment is exactly the kind of thing an agent should not be able to send on its own.
 *
 * Render only in the rider session.
 */
export function ReportForm({ actions }: { actions: TripActions }) {
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

  async function send(form: HTMLFormElement) {
    const data = new FormData(form);
    const equipment = String(data.get("equipment") ?? "").trim().toUpperCase();
    const what = String(data.get("description") ?? "").trim();
    const when = String(data.get("when") ?? "").trim();
    if (!equipment || !what) throw new Error("Both the equipment code and what happened are required.");
    const trip = await actions.report(equipment, when ? `${what} (${when})` : what);
    return {
      filed: true,
      equipment,
      reportCount: trip.reports.length,
      note: "The report is on the shared trip timeline; the companion can see it.",
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
        const done = send(form).then(
          (result) => {
            setAgentFilled(false);
            setStatus(`Filed report for ${result.equipment}.`);
            form.reset();
            return result;
          },
          (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            setStatus(message);
            throw new Error(`The report was not filed: ${message}`);
          }
        );
        // Hand the structured result straight back to the agent that filled the form,
        // instead of navigating. respondWith is the mechanism Chrome documents today.
        if (native.agentInvoked && native.respondWith) native.respondWith(done);
        else void done.catch(() => undefined);
      }}
    >
      <h2 className="font-mono text-xs uppercase tracking-[0.2em]">Report broken equipment</h2>

      <label className="mt-2 block text-sm font-bold">
        Equipment code
        <input
          name="equipment"
          required
          toolparamdescription='The MTA equipment code of the elevator or escalator, e.g. "EL240". station_status lists the codes for a station.'
          placeholder="EL240"
          className="mt-1 block w-full border-2 border-black px-2 py-2 font-mono text-base"
        />
      </label>

      <label className="mt-2 block text-sm font-bold">
        What happened
        <textarea
          name="description"
          required
          rows={2}
          toolparamdescription="What the rider actually saw, in their own words, e.g. 'doors will not close, out of service sign taped to it'."
          className="mt-1 block w-full border-2 border-black px-2 py-2 text-base"
        />
      </label>

      <label className="mt-2 block text-sm font-bold">
        When
        <input
          name="when"
          toolparamdescription='Roughly when it happened, e.g. "just now" or "about 10 minutes ago".'
          placeholder="just now"
          className="mt-1 block w-full border-2 border-black px-2 py-2 text-base"
        />
      </label>

      <button
        type="submit"
        className={`${styles.submit} mt-3 w-full bg-black px-4 py-3 text-lg font-bold uppercase tracking-wide text-white`}
      >
        Send report
      </button>

      {status && <p className="mt-2 font-mono text-xs">{status}</p>}
    </form>
  );
}

export default ReportForm;

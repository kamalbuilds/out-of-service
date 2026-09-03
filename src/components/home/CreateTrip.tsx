"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StationSummary, Trip } from "@/lib/types";
import { StationPicker } from "./StationPicker";
import { Button } from "@/components/ui/Button";

/** A constraint reads as a switch on a sign, not as a checkbox in a settings pane. */
function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-control border px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors duration-150 ${
        checked ? "border-ink bg-ink text-paper" : "border-hair-strong bg-paper text-ink hover:border-ink"
      }`}
    >
      <input
        type="checkbox"
        name={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent"
        data-testid={`c-${id}`}
      />
      {label}
    </label>
  );
}

export function CreateTrip({ stations }: { stations: StationSummary[] }) {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [wheelchair, setWheelchair] = useState(true);
  const [stroller, setStroller] = useState(false);
  const [avoidEscalators, setAvoidEscalators] = useState(false);
  const [maxTransfers, setMaxTransfers] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="border border-ink bg-paper"
      data-testid="create-trip"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError(null);
        if (!from || !to) {
          setError("Pick a station to start from and a station to travel to, then plan the trip.");
          return;
        }
        setBusy(true);
        try {
          const res = await fetch("/api/trip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              from,
              to,
              constraints: { wheelchair, stroller, avoidEscalators, maxTransfers },
            }),
          });
          const body = (await res.json()) as { trip?: Trip; error?: string };
          if (!res.ok || !body.trip) {
            throw new Error(body.error ?? `The server returned HTTP ${res.status}.`);
          }
          router.push(`/t/${body.trip.id}`);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <h2 className="plate border-b border-ink bg-ink px-4 py-2 text-[1.0625rem] text-paper">
        Plan a Step-Free Trip
      </h2>

      <div className="grid gap-6 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] sm:gap-4">
        <StationPicker
          label="from"
          name="from"
          stations={stations}
          value={from}
          onChange={setFrom}
          testId="from"
        />
        <div aria-hidden className="hidden pt-8 sm:flex sm:justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[0.875rem] leading-none text-paper">
            &rarr;
          </span>
        </div>
        <StationPicker
          label="to"
          name="to"
          stations={stations}
          value={to}
          onChange={setTo}
          testId="to"
        />
      </div>

      <fieldset className="border-t border-hair px-4 py-3">
        <legend className="sr-only">Constraints</legend>
        <div className="flex flex-wrap items-center gap-2">
          <span className="colhead mr-1">needs</span>
          <Toggle id="wheelchair" label="Wheelchair" checked={wheelchair} onChange={setWheelchair} />
          <Toggle id="stroller" label="Stroller" checked={stroller} onChange={setStroller} />
          <Toggle
            id="avoidEscalators"
            label="No Escalators"
            checked={avoidEscalators}
            onChange={setAvoidEscalators}
          />
          <label className="inline-flex items-center gap-2 text-[0.8125rem] font-medium">
            <span className="colhead">at most</span>
            <select
              name="maxTransfers"
              value={maxTransfers}
              onChange={(e) => setMaxTransfers(Number(e.target.value))}
              className="num rounded-control border border-hair-strong bg-paper px-2 py-1.5"
              data-testid="c-maxTransfers"
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} transfer{n === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="border-t border-tier-unreliable bg-paper-sunk px-4 py-2.5 text-[0.8125rem] font-medium text-tier-unreliable"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink px-4 py-3">
        <p className="max-w-sm text-[0.75rem] leading-snug text-ink-soft">
          Each candidate route is scored on the elevators it actually depends on, then re-scored
          when the MTA feed changes.
        </p>
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          className="px-6 py-3 text-[0.9375rem]"
          data-testid="create-submit"
        >
          {busy ? "Scoring Routes…" : "Plan the Trip"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StationSummary, Trip } from "@/lib/types";
import { StationPicker } from "./StationPicker";
import { Button } from "@/components/ui/Button";

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
      className="flex flex-col gap-5"
      data-testid="create-trip"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError(null);
        if (!from || !to) {
          setError("Pick a station to start from and a station to travel to.");
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
      <div className="grid gap-5 sm:grid-cols-2">
        <StationPicker
          label="from"
          name="from"
          stations={stations}
          value={from}
          onChange={setFrom}
          testId="from"
        />
        <StationPicker
          label="to"
          name="to"
          stations={stations}
          value={to}
          onChange={setTo}
          testId="to"
        />
      </div>

      <fieldset className="border-2 border-ink px-3 py-2">
        <legend className="label px-1">constraints</legend>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {[
            { id: "wheelchair", label: "wheelchair", value: wheelchair, set: setWheelchair },
            { id: "stroller", label: "stroller", value: stroller, set: setStroller },
            {
              id: "avoidEscalators",
              label: "no escalators",
              value: avoidEscalators,
              set: setAvoidEscalators,
            },
          ].map((c) => (
            <label key={c.id} className="inline-flex items-center gap-2 text-base font-bold">
              <input
                type="checkbox"
                name={c.id}
                checked={c.value}
                onChange={(e) => c.set(e.target.checked)}
                className="h-5 w-5 accent-black"
                data-testid={`c-${c.id}`}
              />
              {c.label}
            </label>
          ))}
          <label className="inline-flex items-center gap-2 text-base font-bold">
            max transfers
            <select
              name="maxTransfers"
              value={maxTransfers}
              onChange={(e) => setMaxTransfers(Number(e.target.value))}
              className="border-2 border-ink px-2 py-1"
              data-testid="c-maxTransfers"
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="border-2 border-[#c4271a] px-3 py-2 text-sm font-bold text-[#c4271a]">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="solid" disabled={busy} className="self-start px-6 py-3 text-base" data-testid="create-submit">
        {busy ? "scoring routes" : "plan the trip"}
      </Button>
    </form>
  );
}

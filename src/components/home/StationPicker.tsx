"use client";

import { useId, useMemo, useState } from "react";
import type { StationSummary } from "@/lib/types";
import { stationMatchesQuery } from "@/lib/adapters/stations";
import { LineBullets } from "@/components/ui/LineBullet";
import { tierStyle } from "@/components/ui/ElevatorChip";

/**
 * Searchable station picker over the accessible-station list. Typing filters the
 * listbox; the value submitted is the station's complex id, so the server never has
 * to guess which "86 St" was meant. Arrow keys move through it, Enter selects.
 */
export function StationPicker({
  label,
  name,
  stations,
  value,
  onChange,
  testId,
}: {
  label: string;
  name: string;
  stations: StationSummary[];
  value: string;
  onChange: (id: string) => void;
  testId: string;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const listId = useId();

  const matches = useMemo(() => {
    const rows = query.trim() ? stations.filter((s) => stationMatchesQuery(s, query)) : stations;
    return rows.slice(0, 60);
  }, [query, stations]);

  const selected = stations.find((s) => s.id === value) ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={searchId} className="colhead">
        {label}
      </label>
      <input
        id={searchId}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a station or a line, say 14 St or L…"
        className="rounded-control border border-hair-strong bg-paper px-3 py-2.5 text-[1rem] placeholder:text-ink-soft/70 focus:border-accent"
        data-testid={`${testId}-search`}
      />
      <select
        id={listId}
        name={name}
        value={value}
        size={6}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="code rounded-control border border-hair-strong bg-paper py-1 text-[0.8125rem]"
        data-testid={testId}
      >
        <option value="">
          {matches.length === 0
            ? `No step-free station matches "${query.trim()}"`
            : `Pick the ${label} station`}
        </option>
        {matches.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.lines.join(" ")} · {s.elevatorCount} elevator
            {s.elevatorCount === 1 ? "" : "s"}
          </option>
        ))}
      </select>

      <div className="min-h-[2.75rem] rounded-plate border border-hair bg-paper px-3 py-2">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="plate text-[1.0625rem]">{selected.name}</span>
              <LineBullets lines={selected.lines} size="xs" />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.75rem] text-ink-soft">
              <span className="num">
                {selected.elevatorCount} elevator{selected.elevatorCount === 1 ? "" : "s"}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-3 w-[3px]"
                  style={{ backgroundColor: tierStyle(selected.worstTier).bar }}
                />
                worst tier here is {tierStyle(selected.worstTier).label}
              </span>
            </div>
          </>
        ) : (
          <p className="num text-[0.75rem] leading-snug text-ink-soft">
            {matches.length} of {stations.length} step-free stations listed. Pick one to see its
            elevators.
          </p>
        )}
      </div>
    </div>
  );
}

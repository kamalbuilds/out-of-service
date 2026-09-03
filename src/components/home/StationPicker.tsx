"use client";

import { useId, useMemo, useState } from "react";
import type { StationSummary } from "@/lib/types";
import { LineBullets } from "@/components/ui/LineBullet";

/**
 * Searchable station picker over the accessible-station list. Typing filters;
 * the value submitted is the station's complex id, so the server never has to
 * guess which "86 St" was meant.
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
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? stations.filter(
          (s) => s.name.toLowerCase().includes(q) || s.lines.some((l) => l.toLowerCase() === q),
        )
      : stations;
    return rows.slice(0, 60);
  }, [query, stations]);

  const selected = stations.find((s) => s.id === value) ?? null;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={listId} className="label">
        {label}
      </label>
      <input
        id={listId}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="type to filter, for example 14 St or L"
        className="border-2 border-ink px-3 py-2 text-base"
        data-testid={`${testId}-search`}
      />
      <select
        name={name}
        value={value}
        size={6}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="border-2 border-ink px-1 py-1 text-base"
        data-testid={testId}
      >
        {matches.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.lines.join(" ")} · {s.elevatorCount} elevator
            {s.elevatorCount === 1 ? "" : "s"}
          </option>
        ))}
      </select>
      <div className="min-h-6 text-sm">
        {selected ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <strong>{selected.name}</strong>
            <LineBullets lines={selected.lines} />
            <span className="text-muted">
              {selected.elevatorCount} elevator{selected.elevatorCount === 1 ? "" : "s"}, worst
              tier {selected.worstTier}
            </span>
          </span>
        ) : (
          <span className="text-muted">
            {matches.length} of {stations.length} accessible stations
          </span>
        )}
      </div>
    </div>
  );
}

import type { ElevatorRef, Tier } from "@/lib/types";
import { SourceNote } from "./SourceNote";

const TIER: Record<Tier, { bar: string; label: string }> = {
  reliable: { bar: "var(--color-tier-reliable)", label: "reliable" },
  watch: { bar: "var(--color-tier-watch)", label: "watch" },
  unreliable: { bar: "var(--color-tier-unreliable)", label: "unreliable" },
  unknown: { bar: "var(--color-tier-unknown)", label: "no history" },
};

export function tierStyle(tier: Tier) {
  return TIER[tier] ?? TIER.unknown;
}

/** 24-month availability arrives as either a fraction or a percentage. */
function availabilityPct(e: ElevatorRef): string | null {
  if (e.availability24m === undefined) return null;
  const pct = e.availability24m <= 1 ? e.availability24m * 100 : e.availability24m;
  return `${pct.toFixed(1)}%`;
}

/**
 * One elevator a route depends on, set like the tag hung on the equipment itself:
 * a tier bar, the equipment code, and the number that earned the tier. An elevator
 * that is out right now is ink with its code struck through, whatever its history says.
 */
export function ElevatorChip({ elevator, simulated }: { elevator: ElevatorRef; simulated?: boolean }) {
  const t = tierStyle(elevator.tier);
  const out = elevator.currentlyOut;
  const avail = availabilityPct(elevator);
  const unscheduled = elevator.unscheduled24m;

  return (
    <span
      className={`inline-flex items-stretch overflow-hidden rounded-plate border ${
        out ? "border-ink bg-ink text-paper" : "border-hair bg-paper-raised text-ink"
      }`}
      title={`${elevator.code}: ${elevator.serving || elevator.station}. Tier ${t.label}.${
        avail ? ` 24-month availability ${avail}.` : " No availability history."
      }${unscheduled !== undefined ? ` ${unscheduled} unscheduled outages in 24 months.` : ""}${
        out ? " Out of service now." : ""
      }${simulated ? " Simulated." : ""}`}
    >
      <span
        aria-hidden
        className="w-[3px] shrink-0"
        style={{ backgroundColor: out ? "var(--color-paper)" : t.bar }}
      />
      <span className="flex items-baseline gap-1.5 px-1.5 py-[3px]">
        <SourceNote
          dataset={elevator.source?.dataset}
          query={elevator.source?.query}
          rows={elevator.source?.rows}
        >
          <span className={`code text-[0.6875rem] font-medium ${out ? "line-through" : ""}`}>
            {elevator.code}
          </span>
        </SourceNote>
        {out ? (
          <span className="code text-[0.625rem] tracking-[0.14em] uppercase">out</span>
        ) : (
          <span className={`num text-[0.6875rem] ${elevator.tier === "unknown" ? "text-ink-soft" : ""}`}>
            {avail ?? "no history"}
          </span>
        )}
        {!out && unscheduled !== undefined ? (
          <span className="num text-[0.625rem] text-ink-soft">{unscheduled} unsch</span>
        ) : null}
        {simulated ? (
          <span className="code rounded-control bg-sim px-1 text-[0.5625rem] uppercase tracking-[0.1em] text-white">
            sim
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * The legend states what earned each tier. Thresholds are per-equipment-type
 * percentiles of 24-month availability (scripts/build-index.ts), not fixed numbers.
 */
export function TierLegend() {
  const rows: Array<[Tier, string]> = [
    ["reliable", "top quarter on availability"],
    ["watch", "middle half"],
    ["unreliable", "bottom quarter, or entrapments"],
  ];
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.6875rem] text-ink-soft">
      {rows.map(([t, meaning]) => (
        <div key={t} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-[3px]"
            style={{ backgroundColor: tierStyle(t).bar }}
          />
          <dt className="font-semibold text-ink">{tierStyle(t).label}</dt>
          <dd className="num">{meaning}</dd>
        </div>
      ))}
      <div className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-3 w-3 bg-ink" />
        <dt className="font-semibold text-ink">out</dt>
        <dd>in the live feed right now</dd>
      </div>
    </dl>
  );
}

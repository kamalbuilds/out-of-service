import type { ElevatorRef, Tier } from "@/lib/types";
import { SourceNote } from "./SourceNote";

const TIER_STYLE: Record<Tier, { bg: string; fg: string; label: string }> = {
  reliable: { bg: "#00873d", fg: "#ffffff", label: "reliable" },
  watch: { bg: "#b45309", fg: "#ffffff", label: "watch" },
  unreliable: { bg: "#c4271a", fg: "#ffffff", label: "unreliable" },
  unknown: { bg: "#ffffff", fg: "#58595b", label: "no history" },
};

export function tierStyle(tier: Tier) {
  return TIER_STYLE[tier] ?? TIER_STYLE.unknown;
}

/**
 * One elevator the route depends on. Colour is the reliability tier from 24
 * months of MTA availability data. An elevator that is out right now is black
 * with its code struck through, whatever its history says.
 */
export function ElevatorChip({ elevator, simulated }: { elevator: ElevatorRef; simulated?: boolean }) {
  const t = tierStyle(elevator.tier);
  const out = elevator.currentlyOut;
  const style = out
    ? { backgroundColor: "#000000", color: "#ffffff", borderColor: "#000000" }
    : { backgroundColor: t.bg, color: t.fg, borderColor: t.bg };
  const avail =
    elevator.availability24m !== undefined
      ? `${(elevator.availability24m * (elevator.availability24m <= 1 ? 100 : 1)).toFixed(1)}%`
      : "no history";

  return (
    <span
      className="inline-flex items-center gap-1.5 border-2 px-1.5 py-0.5 text-xs font-bold"
      style={style}
      title={`${elevator.code}: ${elevator.serving || elevator.station}. Tier ${t.label}. 24-month availability ${avail}.${out ? " OUT NOW." : ""}${simulated ? " SIMULATED." : ""}`}
    >
      <SourceNote
        dataset={elevator.source?.dataset}
        query={elevator.source?.query}
        rows={elevator.source?.rows}
      >
        <span className={out ? "line-through" : ""}>{elevator.code}</span>
      </SourceNote>
      <span className="font-normal opacity-90">{out ? "OUT" : avail}</span>
      {simulated ? <span className="font-mono text-[0.625rem]">SIM</span> : null}
    </span>
  );
}

export function TierLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[0.6875rem]">
      {(["reliable", "watch", "unreliable"] as Tier[]).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 border border-ink"
            style={{ backgroundColor: tierStyle(t).bg }}
          />
          {tierStyle(t).label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 border border-ink bg-black" />
        out right now
      </span>
    </div>
  );
}

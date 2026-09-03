import type { Route } from "@/lib/types";
import { LineBullet } from "@/components/ui/LineBullet";
import { ElevatorChip } from "@/components/ui/ElevatorChip";
import type { ReactNode } from "react";

const RISK_BAR: Record<string, string> = {
  reliable: "#00873d",
  watch: "#b45309",
  unreliable: "#c4271a",
  broken: "#000000",
};

function riskColour(route: Route): string {
  if (route.broken) return RISK_BAR.broken;
  const label = route.riskLabel.toLowerCase();
  for (const key of Object.keys(RISK_BAR)) {
    if (label.includes(key)) return RISK_BAR[key];
  }
  return "#58595b";
}

export function RouteStrip({
  route,
  accepted,
  simulatedOut,
  actions,
}: {
  route: Route;
  accepted?: boolean;
  /** Equipment codes forced out by the ?demo=1 control. */
  simulatedOut?: Set<string>;
  actions?: ReactNode;
}) {
  const sim = simulatedOut ?? new Set<string>();
  const brokenNow = route.broken || route.elevators.some((e) => sim.has(e.code));

  return (
    <article
      className={`border-2 border-ink ${accepted ? "bg-ink text-white" : "bg-white"}`}
      aria-label={`Route ${route.id}, ${route.riskLabel}`}
    >
      <header className="flex items-stretch">
        <div
          className="w-2 shrink-0"
          style={{ backgroundColor: accepted ? "#ffffff" : riskColour(route) }}
          aria-hidden
        />
        <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="signage text-2xl">{route.id.toUpperCase()}</span>
            {accepted ? (
              <span className="label text-white">accepted</span>
            ) : null}
            {brokenNow ? (
              <span className="bg-black px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white">
                {route.broken ? "elevator out" : "simulated outage"}
              </span>
            ) : null}
          </div>
          <div className="flex items-baseline gap-3 text-sm">
            <span>
              <span className="signage text-xl tabular-nums">{route.transfers}</span>{" "}
              transfer{route.transfers === 1 ? "" : "s"}
            </span>
            <span className={accepted ? "text-white" : "text-muted"}>
              risk{" "}
              <span className="signage text-xl tabular-nums">{route.riskScore.toFixed(0)}</span>{" "}
              {route.riskLabel}
            </span>
          </div>
        </div>
      </header>

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t-2 border-current px-3 py-2">
        {route.legs.map((leg, i) => (
          <li key={`${leg.line}-${leg.fromStop}-${i}`} className="flex items-center gap-2">
            {i === 0 ? <span className="text-sm font-bold">{leg.fromName}</span> : null}
            <LineBullet line={leg.line} size="sm" />
            <span className={`text-xs ${accepted ? "text-white/70" : "text-muted"}`}>
              {leg.stops} stop{leg.stops === 1 ? "" : "s"}
            </span>
            <span aria-hidden className="text-xs">
              &rarr;
            </span>
            <span className="text-sm font-bold">{leg.toName}</span>
          </li>
        ))}
      </ol>

      <div className="border-t-2 border-current px-3 py-2">
        <div className="label mb-1" style={accepted ? { color: "#ffffff" } : undefined}>
          elevators this route depends on
        </div>
        <div className="flex flex-wrap gap-1.5">
          {route.elevators.length === 0 ? (
            <span className="text-xs italic">
              The routing index lists no elevator dependency for this route.
            </span>
          ) : (
            route.elevators.map((e) => (
              <ElevatorChip
                key={e.code}
                elevator={sim.has(e.code) ? { ...e, currentlyOut: true } : e}
                simulated={sim.has(e.code)}
              />
            ))
          )}
        </div>
      </div>

      {route.explanation ? (
        <p
          className={`border-t-2 border-current px-3 py-2 text-sm ${accepted ? "text-white" : "text-muted"}`}
        >
          {route.explanation}
        </p>
      ) : null}

      {actions ? (
        <div className="flex flex-wrap gap-2 border-t-2 border-current px-3 py-2">{actions}</div>
      ) : null}
    </article>
  );
}

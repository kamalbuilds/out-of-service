import type { ElevatorRef, Route } from "@/lib/types";
import { LineBullet } from "@/components/ui/LineBullet";
import { ElevatorChip } from "@/components/ui/ElevatorChip";
import type { ReactNode } from "react";

const RISK_COLOUR: Record<string, string> = {
  reliable: "var(--color-tier-reliable)",
  low: "var(--color-tier-reliable)",
  watch: "var(--color-tier-watch)",
  moderate: "var(--color-tier-watch)",
  unreliable: "var(--color-tier-unreliable)",
  avoid: "var(--color-tier-unreliable)",
};

function riskColour(route: Route, broken: boolean): string {
  if (broken) return "var(--color-tier-out)";
  const label = route.riskLabel.toLowerCase();
  for (const key of Object.keys(RISK_COLOUR)) {
    if (label.includes(key)) return RISK_COLOUR[key];
  }
  return "var(--color-tier-unknown)";
}

const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/**
 * The scorer writes its explanation with raw ISO instants. Nobody reads a Z-suffixed
 * timestamp on a platform. Rewrite them in New York time, fixed to that zone so the
 * server and the browser render the same string and hydration stays quiet.
 */
function readableTimes(text: string): string {
  return text.replace(ISO, (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  });
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The stations this route passes through, in order, as a rider reads a platform sign. */
function stationsOf(route: Route): string[] {
  if (route.legs.length === 0) return [];
  const out = [route.legs[0].fromName];
  for (const leg of route.legs) out.push(leg.toName);
  return out;
}

/**
 * Hang each elevator under the station it belongs to. Anything the equipment master
 * names differently from the route graph falls into a trailing group rather than
 * being dropped, because a dropped dependency is the one that strands someone.
 */
function groupElevators(route: Route, stations: string[]) {
  const groups = stations.map((name) => ({ name, elevators: [] as ElevatorRef[] }));
  const rest: ElevatorRef[] = [];
  for (const e of route.elevators) {
    const key = norm(e.station ?? "");
    const hit = groups.find((g) => key && (norm(g.name).includes(key) || key.includes(norm(g.name))));
    if (hit) hit.elevators.push(e);
    else rest.push(e);
  }
  return { groups: groups.filter((g) => g.elevators.length > 0), rest };
}

export function RouteStrip({
  route,
  accepted,
  simulatedOut,
  actions,
  compact,
  lowestRisk,
}: {
  route: Route;
  accepted?: boolean;
  /** Equipment codes forced out by the ?demo=1 control. */
  simulatedOut?: Set<string>;
  actions?: ReactNode;
  /** Inside a proposal card, where the header is already stated above. */
  compact?: boolean;
  /** The best-scoring candidate on this trip, so the three do not read as equals. */
  lowestRisk?: boolean;
}) {
  const sim = simulatedOut ?? new Set<string>();
  const brokenNow = route.broken || route.elevators.some((e) => sim.has(e.code));
  const stations = stationsOf(route);
  const { groups, rest } = groupElevators(route, stations);

  return (
    <article
      className={`border border-l-4 ${accepted ? "border-ink bg-ink text-paper" : "border-hair-strong bg-paper"}`}
      style={{ borderLeftColor: accepted ? "var(--color-paper)" : riskColour(route, brokenNow) }}
      aria-label={`Route ${route.id}, ${route.riskLabel}${brokenNow ? ", elevator out" : ""}`}
      data-testid={`route-${route.id}`}
    >
      {compact ? null : (
        <header className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5 border-b border-current/25 px-3 py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
            <span
              className="num text-[1.75rem] font-semibold leading-none"
              style={accepted ? undefined : { color: riskColour(route, brokenNow) }}
            >
              {route.riskScore.toFixed(0)}
            </span>
            <span
              className="text-[0.875rem] font-semibold"
              style={accepted ? undefined : { color: riskColour(route, brokenNow) }}
            >
              {route.riskLabel}
            </span>
            {accepted ? (
              <span className="border border-paper px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-[0.13em]">
                accepted
              </span>
            ) : null}
            {brokenNow ? (
              <span
                className="px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-[0.13em] text-paper"
                style={{ backgroundColor: "var(--color-tier-out)" }}
              >
                {route.broken ? "elevator out" : "simulated outage"}
              </span>
            ) : null}
            {lowestRisk && !accepted && !brokenNow ? (
              <span className="border border-hair-strong px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-[0.13em] text-ink-soft">
                lowest risk here
              </span>
            ) : null}
          </div>
          <div className={`code num text-[0.6875rem] ${accepted ? "text-paper/60" : "text-ink-subtle"}`}>
            {route.transfers} transfer{route.transfers === 1 ? "" : "s"} · {route.id}
          </div>
        </header>
      )}

      {/* The line itself: origin, the trains you ride, the stations you change at. */}
      {/* Hatching the line itself says "this line is closed". Hatching the whole
          panel says nothing once every candidate is broken, which is common. */}
      <ol
        className={`flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-3 ${
          brokenNow && !accepted ? "hatched" : ""
        }`}
      >
        {route.legs.map((leg, i) => (
          <li key={`${leg.line}-${leg.fromStop}-${i}`} className="flex items-center gap-2.5">
            {i === 0 ? <span className="plate text-[0.9375rem]">{leg.fromName}</span> : null}
            <span className="flex items-center gap-1.5">
              <LineBullet line={leg.line} size="sm" />
              <span className={`num text-[0.6875rem] ${accepted ? "text-paper/70" : "text-ink-subtle"}`}>
                {leg.stops} stop{leg.stops === 1 ? "" : "s"}
              </span>
            </span>
            <span aria-hidden className="text-[0.75rem] opacity-50">
              &rarr;
            </span>
            <span className="plate text-[0.9375rem]">{leg.toName}</span>
          </li>
        ))}
      </ol>

      <div className="border-t border-current/20 px-3 py-2.5">
        <div className={`colhead mb-2 ${accepted ? "text-paper/70" : ""}`}>
          elevators this route depends on
        </div>
        {route.elevators.length === 0 ? (
          <p className="text-[0.75rem] italic">
            The equipment master lists no elevator dependency for this route, so nothing here can be
            scored on outage history.
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {groups.map((g) => (
              <div key={g.name} className="min-w-0">
                <div className={`text-[0.6875rem] font-semibold ${accepted ? "text-paper/70" : "text-ink-soft"}`}>
                  {g.name}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.elevators.map((e) => (
                    <ElevatorChip
                      key={e.code}
                      elevator={sim.has(e.code) ? { ...e, currentlyOut: true } : e}
                      simulated={sim.has(e.code)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {rest.length > 0 ? (
              <div className="min-w-0">
                <div className={`text-[0.6875rem] font-semibold ${accepted ? "text-paper/70" : "text-ink-soft"}`}>
                  elsewhere on the route
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {rest.map((e) => (
                    <ElevatorChip
                      key={e.code}
                      elevator={sim.has(e.code) ? { ...e, currentlyOut: true } : e}
                      simulated={sim.has(e.code)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {route.explanation ? (
        <p
          className={`border-t border-current/20 px-3 py-2.5 text-[0.8125rem] leading-snug ${
            accepted ? "text-paper/85" : "text-ink-soft"
          }`}
        >
          {readableTimes(route.explanation)}
        </p>
      ) : null}

      {actions ? (
        <div className="flex flex-wrap gap-2 border-t border-current/20 px-3 py-2.5">{actions}</div>
      ) : null}
    </article>
  );
}

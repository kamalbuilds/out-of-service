import type { LiveSnapshot } from "@/lib/types";
import { SourceNote } from "@/components/ui/SourceNote";
import { MTA_STATUS_URL } from "@/lib/adapters/sources";

function hours(h: number): string {
  if (!Number.isFinite(h)) return "";
  if (h < 1) return `${Math.max(0, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${Math.round(h / 24)} days`;
}

/** The live banner: how many ADA elevators are out right now, with three of them. */
export function LiveStrip({ live }: { live: LiveSnapshot }) {
  const ada = live.outages.filter((o) => o.isCurrent && o.ada);
  const examples = [...ada].sort((a, b) => b.hoursOut - a.hoursOut).slice(0, 3);

  return (
    <section aria-label="Live outages" className="border-4 border-ink">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b-4 border-ink bg-ink px-4 py-3 text-white">
        <h2 className="signage text-3xl sm:text-4xl">
          <SourceNote
            dataset="MTA current elevator and escalator outages (NYCT ENE feed)"
            query={live.sourceUrl}
            rows={live.outages.length}
            fetchedAt={live.fetchedAt}
          >
            <span className="tabular-nums">{ada.length}</span>
          </SourceNote>{" "}
          ADA elevators out right now
        </h2>
        <a
          className="text-sm underline"
          href={MTA_STATUS_URL}
          target="_blank"
          rel="noreferrer"
        >
          MTA&rsquo;s own status page
        </a>
      </div>

      {examples.length === 0 ? (
        <p className="px-4 py-3 text-sm">
          The feed currently reports no ADA elevator out. Last fetched{" "}
          {new Date(live.fetchedAt).toLocaleString("en-US")}.
        </p>
      ) : (
        <ul>
          {examples.map((o) => (
            <li
              key={o.equipmentCode}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-hair px-4 py-2 last:border-b-0"
            >
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-sm font-bold line-through">{o.equipmentCode}</span>
                <span className="text-base font-bold">{o.station}</span>
                <span className="text-sm text-muted">{o.serving}</span>
              </span>
              <span className="text-sm font-bold tabular-nums">{hours(o.hoursOut)} out</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

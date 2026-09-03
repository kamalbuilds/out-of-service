import type { LiveSnapshot } from "@/lib/types";
import { SourceNote } from "@/components/ui/SourceNote";
import { FetchedAgo } from "@/components/ui/FetchedAgo";
import { LineBullets } from "@/components/ui/LineBullet";
import { LIVE_DATASET, MTA_STATUS_URL } from "@/lib/adapters/sources";

const BOARD_ROWS = 7;

/**
 * A complex like 42 St-Port Authority serves ten lines. Ten bullets is a rainbow
 * that outshouts the number of days the elevator has been out, so the row shows the
 * first four and counts the rest.
 */
const MAX_BULLETS = 4;

/**
 * The feed carries estimated returns that are already in the past on elevators that
 * have been out for years. Print that as overdue rather than as a date that reads
 * like a plan.
 */
function backAt(iso: string | null): string {
  if (!iso) return "not given";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "not given";
  const now = new Date();
  if (t.getTime() < now.getTime()) return "overdue";
  return t.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(t.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

function outFor(h: number): string {
  if (!Number.isFinite(h)) return "";
  if (h < 1) return `${Math.max(0, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} hr`;
  return `${Math.round(h / 24)} days`;
}

/**
 * The board on the wall: every ADA elevator the MTA's own feed says is out right
 * now, longest first, with the equipment code as it appears on the machine.
 */
export function LiveStrip({ live }: { live: LiveSnapshot }) {
  const ada = live.outages.filter((o) => o.isCurrent && o.ada);
  const rows = [...ada].sort((a, b) => b.hoursOut - a.hoursOut);
  const shown = rows.slice(0, BOARD_ROWS);
  const rest = rows.length - shown.length;
  const unreachable = live.stale && live.outages.length === 0;

  return (
    <section aria-label="ADA elevators out right now" className="rounded-plate border border-ink">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 bg-ink px-4 py-3 text-paper">
        <h2 className="flex items-baseline gap-2.5">
          <SourceNote
            dataset={LIVE_DATASET.dataset}
            query={live.sourceUrl}
            rows={live.outages.length}
            fetchedAt={live.fetchedAt}
          >
            <span className="plate num text-[2rem] leading-none">{ada.length}</span>
          </SourceNote>
          <span className="text-[0.9375rem] font-medium">ADA elevators out right now</span>
        </h2>
        <div className="flex items-baseline gap-4 text-[0.6875rem] text-paper/70">
          <FetchedAgo fetchedAt={live.fetchedAt} />
          <a className="underline underline-offset-2 hover:text-paper" href={MTA_STATUS_URL} target="_blank" rel="noreferrer">
            MTA status page
          </a>
        </div>
      </header>

      {unreachable ? (
        <p className="px-4 py-4 text-sm text-tier-unreliable">
          The MTA outage feed did not answer on this request. Routes below are scored on 24 months
          of history only, with no live layer, until the feed returns.
        </p>
      ) : shown.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-soft">
          The feed reports no ADA elevator out of service right now. That is rare and it does not
          last; the board fills again as soon as one is reported.
        </p>
      ) : (
        <>
          <div className="colhead hidden gap-3 border-b border-hair px-4 py-1.5 sm:grid sm:grid-cols-[6.5rem_1fr_7rem_5rem]">
            <span>equipment</span>
            <span>station and what it serves</span>
            <span>back at</span>
            <span className="text-right">out for</span>
          </div>
          <ul>
            {shown.map((o) => (
              <li
                key={o.equipmentCode}
                className="border-b border-hair px-4 py-2.5 last:border-b-0 sm:grid sm:grid-cols-[6.5rem_1fr_7rem_5rem] sm:items-baseline sm:gap-3 sm:py-2"
              >
                <span className="flex items-baseline justify-between gap-3 sm:block">
                  <span className="code text-[0.75rem] font-medium line-through decoration-ink-soft">
                    {o.equipmentCode}
                  </span>
                  <span className="num text-[0.8125rem] font-semibold sm:hidden">
                    {outFor(o.hoursOut)} out
                  </span>
                </span>
                <span className="mt-1 block min-w-0 sm:mt-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="plate text-[0.9375rem]">{o.station}</span>
                    {o.lines.length > 0 ? (
                      <span className="flex items-center gap-1">
                        <LineBullets lines={o.lines.slice(0, MAX_BULLETS)} size="xs" />
                        {o.lines.length > MAX_BULLETS ? (
                          <span className="num text-[0.6875rem] text-ink-soft">
                            +{o.lines.length - MAX_BULLETS}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-soft">{o.serving}</span>
                </span>
                <span className="code num mt-1 block text-[0.6875rem] text-ink-soft sm:mt-0">
                  <span className="sm:hidden">back </span>
                  {backAt(o.estimatedReturn)}
                </span>
                <span className="num hidden text-right text-[0.8125rem] font-semibold sm:block">
                  {outFor(o.hoursOut)}
                </span>
              </li>
            ))}
          </ul>
          {rest > 0 ? (
            <p className="border-t border-hair px-4 py-2 text-[0.75rem] text-ink-soft">
              <span className="num font-semibold text-ink">{rest}</span> more ADA elevators are out
              in the same feed. Plan a trip and the board narrows to the ones your route depends on.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

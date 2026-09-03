import type { Metadata } from "next";
import { listStations } from "@/lib/adapters/stations";
import { liveSnapshotOrEmpty } from "@/lib/adapters/live";
import { CreateTrip } from "@/components/home/CreateTrip";
import { AgentCreateTrip } from "@/components/home/AgentCreateTrip";
import { LiveStrip } from "@/components/home/LiveStrip";
import { SourceNote } from "@/components/ui/SourceNote";
import { EQUIPMENT_DATASET } from "@/lib/adapters/sources";
import type { StationSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Out of Service: step-free NYC subway routing",
};

/** The three feeds every number on this site comes from. Named, not summarised. */
const SOURCES = [
  {
    what: "24 months of elevator availability, outages and entrapments, per equipment code. This sets the tier.",
    name: "MTA Elevator and Escalator Availability, monthly",
    href: "https://data.ny.gov/resource/rc78-7x78.json",
  },
  {
    what: "Which elevator serves which platform, in which direction, and whether a redundant one exists.",
    name: "MTA equipment master, NYCT ENE",
    href: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json",
  },
  {
    what: "What is out of service at this moment, with the reason and the estimated return.",
    name: "MTA current outages, NYCT ENE",
    href: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json",
  },
];

export default async function Home() {
  const live = await liveSnapshotOrEmpty();

  let stations: StationSummary[] = [];
  let indexError: string | null = null;
  try {
    stations = listStations();
  } catch (err) {
    indexError = (err as Error).message;
  }

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-24 sm:px-8">
      <header className="border-b border-ink pb-6 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h1 className="plate text-[clamp(2rem,5vw,3rem)] text-balance">Out of Service</h1>
          <p className="colhead">New York City · step-free subway routing</p>
        </div>
        <p className="mt-3 max-w-xl text-[1.0625rem] leading-snug text-pretty">
          Plan a subway trip on the outage record of the elevators it depends on, then share it
          with a companion.
        </p>
      </header>

      <section className="mt-8" aria-label="Plan a trip">
        {indexError ? (
          <p role="alert" className="border border-tier-unreliable px-4 py-3 text-sm font-medium text-tier-unreliable">
            The station index did not load, so no trip can be planned right now. {indexError}
          </p>
        ) : stations.length === 0 ? (
          <p className="border border-ink px-4 py-3 text-sm">
            The station index is empty. Run the index build before planning a trip.
          </p>
        ) : (
          <CreateTrip stations={stations} />
        )}
      </section>

      <section className="mt-8">
        <LiveStrip live={live} />
      </section>

      <section className="mt-8 border border-hair-strong bg-paper-sunk" aria-label="Agent surface">
        <div className="grid gap-6 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div>
            <h2 className="plate text-[1.0625rem]">The Same Trip, as a Tool an Agent Can Call</h2>
            <p className="mt-2 max-w-lg text-[0.875rem] leading-snug text-ink-soft">
              This form carries <code className="code text-ink">toolname</code> and{" "}
              <code className="code text-ink">toolparamdescription</code> attributes, so the browser
              registers it with the page&rsquo;s model context and an agent can fill it. There is no{" "}
              <code className="code text-ink">toolautosubmit</code> anywhere in this app: the agent
              fills the fields, a person reads them and presses the button.
            </p>
            <p className="mt-2 max-w-lg text-[0.875rem] leading-snug text-ink-soft">
              Open the trip it creates in two windows and the tool sets differ. The rider&rsquo;s
              session registers the accept tools. The companion&rsquo;s session never sees them, and
              the server rejects an accept from a companion even if one is forged.
            </p>
            <dl className="mt-4 grid max-w-lg grid-cols-[7.5rem_1fr] gap-x-4 gap-y-1.5 border-t border-hair pt-3 text-[0.8125rem]">
              <dt className="colhead">toolname</dt>
              <dd className="code text-ink">create_trip</dd>
              <dt className="colhead">parameters</dt>
              <dd className="code text-ink">from, to, wheelchair, avoidEscalators, maxTransfers</dd>
              <dt className="colhead">autosubmit</dt>
              <dd className="code text-ink">absent, so a person presses the button</dd>
            </dl>
          </div>
          <AgentCreateTrip />
        </div>
      </section>

      <footer className="mt-12 border-t border-ink pt-5">
        <h2 className="plate text-[1.0625rem]">How the Score Is Built</h2>
        <ol className="mt-3 grid gap-4 sm:grid-cols-3">
          {SOURCES.map((s, i) => (
            <li key={s.href}>
              <span className="colhead num">source {i + 1}</span>
              <a
                className="mt-1 block text-[0.875rem] font-semibold text-accent underline underline-offset-2 hover:text-accent-ink"
                href={s.href}
                target="_blank"
                rel="noreferrer"
              >
                {s.name}
              </a>
              <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">{s.what}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-hair pt-3 text-[0.75rem] text-ink-soft">
          <SourceNote
            dataset={EQUIPMENT_DATASET.dataset}
            query={EQUIPMENT_DATASET.query}
            rows={stations.length}
          >
            <span className="num">{stations.length}</span> step-free stations indexed
          </SourceNote>
          {" · "}
          <SourceNote
            dataset="MTA current elevator and escalator outages (NYCT ENE feed)"
            query={live.sourceUrl}
            rows={live.outages.length}
            fetchedAt={live.fetchedAt}
          >
            <span className="num">{live.outages.length}</span> live outage rows read this request
          </SourceNote>
        </p>
      </footer>
    </main>
  );
}

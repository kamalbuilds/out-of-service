import { listStations } from "@/lib/adapters/stations";
import { liveSnapshotOrEmpty } from "@/lib/adapters/live";
import { CreateTrip } from "@/components/home/CreateTrip";
import { AgentCreateTrip } from "@/components/home/AgentCreateTrip";
import { LiveStrip } from "@/components/home/LiveStrip";
import { SourceNote } from "@/components/ui/SourceNote";
import { EQUIPMENT_DATASET } from "@/lib/adapters/sources";
import type { StationSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto w-full max-w-[1100px] px-4 pb-24 sm:px-6">
      <header className="border-b-4 border-ink py-6">
        <h1 className="signage text-6xl uppercase sm:text-8xl">Out of Service</h1>
        <p className="mt-3 max-w-2xl text-xl sm:text-2xl">
          Plan an accessible NYC subway trip on the outage history of the elevators it actually
          depends on, and hand the same trip to a companion who is watching it with you.
        </p>
      </header>

      <div className="mt-6">
        <LiveStrip live={live} />
      </div>

      <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-label="Plan a trip">
        <div>
          <h2 className="label">plan a trip</h2>
          {indexError ? (
            <p role="alert" className="mt-2 border-2 border-[#c4271a] px-3 py-2 text-sm font-bold text-[#c4271a]">
              {indexError}
            </p>
          ) : (
            <div className="mt-3">
              <CreateTrip stations={stations} />
            </div>
          )}
        </div>
        <div>
          <h2 className="label">or let an agent fill it</h2>
          <p className="mt-1 mb-3 text-sm text-muted">
            The same trip, as a declarative WebMCP tool. An agent fills these fields; a person
            presses Create. Nothing here submits itself.
          </p>
          <AgentCreateTrip />
        </div>
      </section>

      <footer className="mt-16 border-t-2 border-ink pt-4 text-sm text-muted">
        <SourceNote
          dataset={EQUIPMENT_DATASET.dataset}
          query={EQUIPMENT_DATASET.query}
          rows={stations.length}
        >
          {stations.length} accessible stations
        </SourceNote>
        {" · "}
        <SourceNote
          dataset="MTA current elevator and escalator outages (NYCT ENE feed)"
          query={live.sourceUrl}
          rows={live.outages.length}
          fetchedAt={live.fetchedAt}
        >
          {live.outages.length} live outage rows
        </SourceNote>
      </footer>
    </main>
  );
}

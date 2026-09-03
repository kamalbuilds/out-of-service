"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTrip } from "./TripProvider";
import { RouteStrip } from "./RouteStrip";
import { CompanionLink } from "./CompanionLink";
import { Button } from "@/components/ui/Button";
import { TierLegend } from "@/components/ui/ElevatorChip";
import { SourceNote } from "@/components/ui/SourceNote";
import { WebMCPTools } from "@/components/webmcp/WebMCPTools";
import { ReportForm } from "@/components/webmcp/ReportForm";
import type { LiveOutage, Route } from "@/lib/types";
import { MTA_STATUS_URL } from "@/lib/adapters/sources";

function StreamDot({ state, label }: { state: "connecting" | "open" | "closed"; label: string }) {
  const colour = state === "open" ? "#00873d" : state === "connecting" ? "#b45309" : "#c4271a";
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: colour }}
        aria-hidden
      />
      {label} {state}
    </span>
  );
}

function hoursLabel(o: LiveOutage): string {
  if (!Number.isFinite(o.hoursOut)) return "";
  if (o.hoursOut < 1) return `${Math.max(0, Math.round(o.hoursOut * 60))} min out`;
  if (o.hoursOut < 48) return `${o.hoursOut.toFixed(1)} h out`;
  return `${Math.round(o.hoursOut / 24)} days out`;
}

export function TripView() {
  const {
    trip,
    role,
    actions,
    readers,
    live,
    outages,
    simulated,
    simulate,
    clearSimulated,
    demo,
    tripStream,
    liveStream,
    error,
  } = useTrip();

  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [simCode, setSimCode] = useState("");

  const simulatedCodes = useMemo(
    () => new Set(simulated.map((o) => o.equipmentCode)),
    [simulated],
  );

  const accepted = trip.candidates.find((r) => r.id === trip.acceptedRouteId) ?? null;
  const pending = trip.proposals.filter((p) => p.status === "pending");

  const routeCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const r of accepted ? [accepted] : trip.candidates) {
      for (const e of r.elevators) codes.add(e.code);
    }
    return codes;
  }, [accepted, trip.candidates]);

  const onRoute = outages.filter((o) => o.isCurrent && routeCodes.has(o.equipmentCode));
  const watched = outages.filter(
    (o) => o.isCurrent && trip.watch.includes(o.equipmentCode) && !routeCodes.has(o.equipmentCode),
  );

  const guard = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      /* error surfaces through the provider's error state */
    } finally {
      setBusy(null);
    }
  };

  const proposeActions = (route: Route) =>
    role === "companion" && route.id !== trip.acceptedRouteId ? (
      <Button
        type="button"
        disabled={busy !== null || reason.trim().length === 0}
        onClick={() => guard(`propose-${route.id}`, () => actions.proposeReroute(route, reason.trim()))}
        data-testid={`propose-${route.id}`}
      >
        {busy === `propose-${route.id}` ? "proposing" : `propose ${route.id}`}
      </Button>
    ) : role === "rider" && route.id !== trip.acceptedRouteId ? (
      <Button
        type="button"
        variant="solid"
        disabled={busy !== null}
        onClick={() => guard(`accept-${route.id}`, () => actions.acceptRoute(route.id))}
        data-testid={`accept-${route.id}`}
      >
        {busy === `accept-${route.id}` ? "accepting" : `accept ${route.id}`}
      </Button>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 sm:px-6">
      <header className="border-b-4 border-ink py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <Link href="/" className="signage text-2xl uppercase">
            Out of Service
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <StreamDot state={tripStream} label="trip" />
            <StreamDot state={liveStream} label="live" />
            <span className="font-mono text-xs text-muted">v{trip.version}</span>
          </div>
        </div>
      </header>

      <div
        className={`mt-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-4 border-ink px-3 py-3 ${
          role === "rider" ? "bg-ink text-white" : "bg-[#FCCC0A] text-ink"
        }`}
      >
        <span className="signage text-2xl uppercase" data-testid="role-banner">
          You are the {role}
        </span>
        <span className="text-sm">
          {role === "rider"
            ? "You accept routes and reroutes. Your agent has accept_route, accept_reroute and report_broken_equipment."
            : "You propose reroutes and watch equipment. Your agent has no accept tool, and the server refuses an accept from this session."}
        </span>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 border-2 border-[#c4271a] bg-white px-3 py-2 text-sm font-bold text-[#c4271a]"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ------------------------------- trip ------------------------------- */}
        <section aria-label="Trip" className="flex flex-col gap-5">
          <div>
            <div className="label">trip</div>
            <h1 className="signage mt-1 text-4xl sm:text-5xl">
              {trip.fromName}
              <span className="mx-2 text-muted" aria-hidden>
                &rarr;
              </span>
              {trip.toName}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {[
                trip.constraints.wheelchair ? "wheelchair" : null,
                trip.constraints.stroller ? "stroller" : null,
                trip.constraints.avoidEscalators ? "no escalators" : null,
                `max ${trip.constraints.maxTransfers} transfer${trip.constraints.maxTransfers === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .map((c) => (
                  <span key={c as string} className="border-2 border-ink px-2 py-0.5 font-bold uppercase tracking-wide">
                    {c}
                  </span>
                ))}
            </div>
          </div>

          <TierLegend />

          {role === "companion" ? (
            <label className="block">
              <span className="label">why the rider should switch</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="EL240 has been out 31 hours and has no redundant elevator"
                className="mt-1 w-full border-2 border-ink px-3 py-2 text-sm"
                data-testid="propose-reason"
              />
            </label>
          ) : null}

          <div className="flex flex-col gap-4">
            <h2 className="label">
              {trip.candidates.length} candidate route{trip.candidates.length === 1 ? "" : "s"}
            </h2>
            {trip.candidates.length === 0 ? (
              <p className="border-2 border-ink px-3 py-2 text-sm">
                The routing index returned no accessible route between these two stations under
                these constraints.
              </p>
            ) : (
              trip.candidates.map((r) => (
                <RouteStrip
                  key={r.id}
                  route={r}
                  accepted={r.id === trip.acceptedRouteId}
                  simulatedOut={simulatedCodes}
                  actions={proposeActions(r)}
                />
              ))
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="label" data-testid="proposals-heading">
              {pending.length} pending proposal{pending.length === 1 ? "" : "s"}
            </h2>
            {trip.proposals.length === 0 ? (
              <p className="text-sm text-muted">
                No reroute proposed yet. The companion proposes; the rider decides.
              </p>
            ) : (
              trip.proposals.map((p) => (
                <div
                  key={p.id}
                  className="border-2 border-ink"
                  data-testid={`proposal-${p.id}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink px-3 py-2">
                    <span className="signage text-lg uppercase">
                      {p.by} proposes {p.route.id}
                    </span>
                    <span className="label">{p.status}</span>
                  </div>
                  <p className="px-3 py-2 text-sm">{p.reason}</p>
                  <div className="border-t-2 border-ink px-3 py-2">
                    <RouteStrip route={p.route} simulatedOut={simulatedCodes} />
                  </div>
                  {role === "rider" && p.status === "pending" ? (
                    <div className="flex gap-2 border-t-2 border-ink px-3 py-2">
                      <Button
                        type="button"
                        variant="solid"
                        disabled={busy !== null}
                        onClick={() => guard(`ok-${p.id}`, () => actions.acceptReroute(p.id))}
                        data-testid={`accept-proposal-${p.id}`}
                      >
                        accept reroute
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={busy !== null}
                        onClick={() =>
                          guard(`no-${p.id}`, () =>
                            fetch(`/api/trip/${trip.id}/action`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                type: "accept_reroute",
                                role,
                                payload: { proposalId: p.id, decision: "reject" },
                              }),
                            }),
                          )
                        }
                        data-testid={`reject-proposal-${p.id}`}
                      >
                        reject
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {role === "rider" ? <CompanionLink tripId={trip.id} /> : null}
        </section>

        {/* ------------------------------- live ------------------------------- */}
        <section aria-label="Live" className="flex flex-col gap-5">
          <div className="border-2 border-ink">
            <div className="label border-b-2 border-ink px-3 py-1.5">
              outages on this trip&rsquo;s elevators
            </div>
            {onRoute.length === 0 ? (
              <p className="px-3 py-3 text-sm">
                No elevator this trip depends on is out right now.
                <SourceNote
                  className="ml-1"
                  dataset="MTA current elevator and escalator outages (NYCT ENE)"
                  query={live?.sourceUrl}
                  rows={live?.outages.length}
                  fetchedAt={live?.fetchedAt}
                >
                  checked against {live?.outages.length ?? 0} live rows
                </SourceNote>
              </p>
            ) : (
              <ul>
                {onRoute.map((o) => (
                  <li
                    key={o.equipmentCode}
                    className="border-b-2 border-hair px-3 py-2 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="signage text-xl">
                        <span className="line-through">{o.equipmentCode}</span>{" "}
                        {o.simulated ? (
                          <span className="ml-1 bg-[#6c2bd9] px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wider text-white">
                            simulated
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm font-bold">{hoursLabel(o)}</span>
                    </div>
                    <div className="text-sm">{o.station}</div>
                    <div className="text-xs text-muted">{o.serving}</div>
                    <div className="mt-1 text-xs">
                      {o.estimatedReturn ? (
                        <>back at {new Date(o.estimatedReturn).toLocaleString("en-US")}</>
                      ) : (
                        <>no estimated return in the feed</>
                      )}
                      {o.redundant ? " · a redundant elevator exists here" : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-2 border-ink">
            <div className="label border-b-2 border-ink px-3 py-1.5">
              watch list ({trip.watch.length})
            </div>
            {trip.watch.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">
                Nothing watched. Either agent can call watch_equipment to add a code here.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2 px-3 py-2">
                {trip.watch.map((code) => {
                  const out = watched.find((o) => o.equipmentCode === code);
                  return (
                    <li
                      key={code}
                      className={`border-2 border-ink px-2 py-0.5 font-mono text-xs ${out ? "bg-ink text-white" : ""}`}
                    >
                      {code} {out ? `OUT ${hoursLabel(out)}` : "in service"}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-2 border-ink">
            <div className="label border-b-2 border-ink px-3 py-1.5">timeline</div>
            <ol className="max-h-80 overflow-y-auto" data-testid="timeline">
              {[...trip.notes].reverse().map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="border-b-2 border-hair px-3 py-2 text-sm last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="label">{e.by}</span>
                    <time className="font-mono text-[0.6875rem] text-muted" dateTime={e.at}>
                      {new Date(e.at).toLocaleTimeString("en-US")}
                    </time>
                  </div>
                  <div>{e.text}</div>
                </li>
              ))}
            </ol>
            <form
              className="flex gap-2 border-t-2 border-ink px-3 py-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (!note.trim()) return;
                const text = note.trim();
                setNote("");
                void guard("note", () => actions.addNote(text));
              }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="add a note to the shared timeline"
                aria-label="Add a note to the shared timeline"
                className="flex-1 border-2 border-ink px-2 py-1 text-sm"
                data-testid="note-input"
              />
              <Button type="submit" disabled={busy !== null}>
                add
              </Button>
            </form>
          </div>

          {role === "rider" ? <ReportForm actions={actions} /> : null}

          <WebMCPTools role={role} trip={trip} actions={actions} readers={readers} />

          {demo ? (
            <div className="border-2 border-[#6c2bd9]">
              <div className="label border-b-2 border-[#6c2bd9] px-3 py-1.5 text-[#6c2bd9]">
                demo control &middot; ?demo=1
              </div>
              <div className="flex flex-col gap-2 px-3 py-2">
                <p className="text-xs text-muted">
                  Forces an outage on one equipment code in this browser session only. It is
                  labelled SIMULATED here and in every tool result, is never written to the trip,
                  and never reaches the index or the MTA feed.
                </p>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={simCode}
                    onChange={(e) => setSimCode(e.target.value)}
                    aria-label="Equipment to simulate out"
                    className="border-2 border-ink px-2 py-1 font-mono text-sm"
                    data-testid="sim-select"
                  >
                    <option value="">pick an elevator on this trip</option>
                    {[...routeCodes].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    onClick={() => simulate(simCode)}
                    disabled={!simCode}
                    data-testid="sim-go"
                  >
                    simulate outage
                  </Button>
                  {simulated.length > 0 ? (
                    <Button type="button" variant="danger" onClick={clearSimulated}>
                      clear {simulated.length}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted">
            Live rows come from the MTA&rsquo;s own current-outage feed.{" "}
            <a className="underline" href={MTA_STATUS_URL} target="_blank" rel="noreferrer">
              MTA elevator and escalator status
            </a>
            {live?.fetchedAt ? ` · fetched ${new Date(live.fetchedAt).toLocaleTimeString("en-US")}` : null}
          </p>
        </section>
      </div>
    </div>
  );
}

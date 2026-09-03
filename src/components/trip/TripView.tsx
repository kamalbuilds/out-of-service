"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTrip } from "./TripProvider";
import { RouteStrip } from "./RouteStrip";
import { CompanionLink } from "./CompanionLink";
import { Button } from "@/components/ui/Button";
import { TierLegend } from "@/components/ui/ElevatorChip";
import { SourceNote } from "@/components/ui/SourceNote";
import { FetchedAgo } from "@/components/ui/FetchedAgo";
import { WebMCPTools } from "@/components/webmcp/WebMCPTools";
import { ReportForm } from "@/components/webmcp/ReportForm";
import type { LiveOutage, Route } from "@/lib/types";
import { MTA_STATUS_URL } from "@/lib/adapters/sources";

/** A stream is either carrying versions or it is not. Say which, in one glyph and one word. */
function StreamDot({ state, label }: { state: "connecting" | "open" | "closed"; label: string }) {
  const colour =
    state === "open"
      ? "var(--color-tier-reliable)"
      : state === "connecting"
        ? "var(--color-tier-watch)"
        : "var(--color-tier-out)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colour }} aria-hidden />
      <span className="text-ink-soft">
        {label} {state}
      </span>
    </span>
  );
}

function outFor(o: LiveOutage): string {
  if (!Number.isFinite(o.hoursOut)) return "";
  if (o.hoursOut < 1) return `${Math.max(0, Math.round(o.hoursOut * 60))} min`;
  if (o.hoursOut < 48) return `${o.hoursOut.toFixed(1)} hr`;
  return `${Math.round(o.hoursOut / 24)} days`;
}

/** A panel on the board: a hairline frame with a stated heading, never a floating card. */
function Panel({
  title,
  meta,
  children,
  tone = "ink",
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  tone?: "ink" | "sim";
}) {
  const border = tone === "sim" ? "border-sim" : "border-hair-strong";
  return (
    <section className={`border ${border} bg-paper`}>
      <header
        className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-3 py-1.5 ${
          tone === "sim" ? "border-sim bg-sim text-white" : "border-hair bg-paper-sunk"
        }`}
      >
        <h2 className={`colhead ${tone === "sim" ? "text-white" : ""}`}>{title}</h2>
        {meta ? <span className="text-[0.6875rem] text-ink-soft">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

export function TripView() {
  const {
    trip,
    role,
    actions,
    readers,
    companionKey,
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

  const simulatedCodes = useMemo(() => new Set(simulated.map((o) => o.equipmentCode)), [simulated]);

  const accepted = trip.candidates.find((r) => r.id === trip.acceptedRouteId) ?? null;
  const bestId = useMemo(() => {
    if (trip.candidates.length < 2) return null;
    const usable = trip.candidates.filter((r) => !r.broken);
    const pool = usable.length > 0 ? usable : trip.candidates;
    return pool.reduce((a, b) => (b.riskScore < a.riskScore ? b : a)).id;
  }, [trip.candidates]);
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
        {busy === `propose-${route.id}` ? "Proposing…" : `Propose ${route.id.toUpperCase()}`}
      </Button>
    ) : role === "rider" && route.id !== trip.acceptedRouteId ? (
      <Button
        type="button"
        variant="primary"
        disabled={busy !== null}
        onClick={() => guard(`accept-${route.id}`, () => actions.acceptRoute(route.id))}
        data-testid={`accept-${route.id}`}
      >
        {busy === `accept-${route.id}` ? "Accepting…" : `Accept ${route.id.toUpperCase()}`}
      </Button>
    ) : null;

  const routeLine = (
    <span className="inline-flex flex-wrap items-baseline gap-2">
      <span>{trip.fromName}</span>
      <span aria-hidden className="opacity-45">
        &rarr;
      </span>
      <span>{trip.toName}</span>
    </span>
  );

  return (
    <div>
      {/* The two roles must be unmistakable from across a room, not from a label. */}
      {role === "companion" ? (
        <div className="border-b border-ink bg-ink text-paper" data-testid="role-banner">
          <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-4 py-4 sm:px-8">
            <div>
              <h1 className="plate text-[1.5rem] sm:text-[1.875rem]">Companion view</h1>
              <p className="plate mt-1 text-[1.0625rem] text-paper/80">{routeLine}</p>
            </div>
            <p className="max-w-sm text-[0.8125rem] leading-snug text-paper/75">
              You are watching someone else&rsquo;s trip. You can propose a reroute and watch
              equipment. The accept tools are not registered in this window, and the server refuses
              an accept from this session.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1360px] px-4 pb-24 sm:px-8">
        <header className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-ink py-3">
          <Link href="/" className="plate text-[1.0625rem] hover:text-accent">
            Out of Service
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <StreamDot state={tripStream} label="trip" />
            <StreamDot state={liveStream} label="live" />
            <span className="code num text-[0.6875rem] text-ink-subtle">v{trip.version}</span>
          </div>
        </header>

        {role === "rider" ? (
          <div className="border-b border-hair py-4" data-testid="role-banner">
            <p className="colhead">You are the rider</p>
            <h1 className="plate mt-1.5 text-[clamp(1.5rem,3.6vw,2.25rem)] text-balance">{routeLine}</h1>
            <p className="mt-1.5 max-w-xl text-[0.8125rem] leading-snug text-ink-soft">
              You accept a route and any reroute. Your agent holds accept_route, accept_reroute and
              report_broken_equipment; the companion&rsquo;s never does.
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[
            trip.constraints.wheelchair ? "wheelchair" : null,
            trip.constraints.stroller ? "stroller" : null,
            trip.constraints.avoidEscalators ? "no escalators" : null,
            `max ${trip.constraints.maxTransfers} transfer${trip.constraints.maxTransfers === 1 ? "" : "s"}`,
          ]
            .filter(Boolean)
            .map((c) => (
              <span
                key={c as string}
                className="border border-hair-strong px-2 py-0.5 text-[0.6875rem] font-medium"
              >
                {c}
              </span>
            ))}
        </div>

        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="mt-3 border border-tier-unreliable bg-paper-sunk px-3 py-2 text-[0.8125rem] font-medium text-tier-unreliable"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* ------------------------------- routes ------------------------------- */}
          <section aria-label="Routes" className="flex flex-col gap-5">
            <TierLegend />

            {role === "companion" ? (
              <label className="block">
                <span className="colhead">why the rider should switch</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="EL240 has been out 31 hours and has no redundant elevator…"
                  className="mt-1.5 w-full rounded-control border border-hair-strong bg-paper px-3 py-2 text-[0.875rem] focus:border-accent"
                  data-testid="propose-reason"
                />
              </label>
            ) : null}

            <div className="flex flex-col gap-4">
              <h2 className="colhead">
                {trip.candidates.length} candidate route{trip.candidates.length === 1 ? "" : "s"}
              </h2>
              {trip.candidates.length === 0 ? (
                <p className="border border-hair-strong bg-paper px-3 py-3 text-[0.875rem]">
                  No step-free route joins these two stations under these constraints. Raise the
                  transfer limit, or plan a trip from a neighbouring station.
                </p>
              ) : (
                trip.candidates.map((r) => (
                  <RouteStrip
                    key={r.id}
                    route={r}
                    accepted={r.id === trip.acceptedRouteId}
                    simulatedOut={simulatedCodes}
                    lowestRisk={r.id === bestId}
                    actions={proposeActions(r)}
                  />
                ))
              )}
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="colhead" data-testid="proposals-heading">
                {pending.length} pending proposal{pending.length === 1 ? "" : "s"}
              </h2>
              {trip.proposals.length === 0 ? (
                <p className="text-[0.8125rem] text-ink-soft">
                  Nothing proposed yet. The companion proposes a reroute; the rider is the only one
                  who can accept it.
                </p>
              ) : (
                trip.proposals.map((p) => (
                  <div key={p.id} className="border border-hair-strong bg-paper" data-testid={`proposal-${p.id}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hair bg-paper-sunk px-3 py-2">
                      <span className="plate text-[0.9375rem]">
                        {p.by} proposes {p.route.id.toUpperCase()}
                      </span>
                      <span className="colhead">{p.status}</span>
                    </div>
                    <p className="px-3 py-2 text-[0.875rem]">{p.reason}</p>
                    <div className="border-t border-hair px-3 py-2">
                      <RouteStrip route={p.route} simulatedOut={simulatedCodes} compact />
                    </div>
                    {role === "rider" && p.status === "pending" ? (
                      <div className="flex gap-2 border-t border-hair px-3 py-2">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={busy !== null}
                          onClick={() => guard(`ok-${p.id}`, () => actions.acceptReroute(p.id))}
                          data-testid={`accept-proposal-${p.id}`}
                        >
                          Accept Reroute
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy !== null}
                          onClick={() => guard(`no-${p.id}`, () => actions.rejectReroute(p.id))}
                          data-testid={`reject-proposal-${p.id}`}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {role === "rider" ? <CompanionLink tripId={trip.id} companionKey={companionKey} /> : null}
          </section>

          {/* -------------------------------- board -------------------------------- */}
          <section aria-label="Live board" className="flex flex-col gap-5">
            <Panel
              title="out on this trip"
              meta={live?.fetchedAt ? <FetchedAgo fetchedAt={live.fetchedAt} /> : null}
            >
              {onRoute.length === 0 ? (
                <div className="px-3 py-3 text-[0.8125rem]">
                  No elevator this trip depends on is out right now.{" "}
                  <SourceNote
                    dataset="MTA current elevator and escalator outages (NYCT ENE)"
                    query={live?.sourceUrl}
                    rows={live?.outages.length}
                    fetchedAt={live?.fetchedAt}
                  >
                    <span className="num">{live?.outages.length ?? 0}</span> live rows checked
                  </SourceNote>
                </div>
              ) : (
                <ul>
                  {onRoute.map((o) => (
                    <li key={o.equipmentCode} className="border-b border-hair px-3 py-2.5 last:border-b-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="flex items-baseline gap-2">
                          <span className="code text-[0.8125rem] font-medium line-through">
                            {o.equipmentCode}
                          </span>
                          {o.simulated ? (
                            <span className="code bg-sim px-1 text-[0.5625rem] uppercase tracking-[0.1em] text-white">
                              simulated
                            </span>
                          ) : null}
                        </span>
                        <span className="num text-[0.8125rem] font-semibold">{outFor(o)} out</span>
                      </div>
                      <div className="plate mt-1 text-[0.9375rem]">{o.station}</div>
                      <div className="mt-0.5 text-[0.75rem] leading-snug text-ink-soft">{o.serving}</div>
                      <div className="code num mt-1 text-[0.6875rem] text-ink-subtle">
                        {o.estimatedReturn
                          ? `back ${new Date(o.estimatedReturn).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}`
                          : "no estimated return in the feed"}
                        {o.redundant ? " · a redundant elevator exists here" : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="watch list" meta={<span className="num">{trip.watch.length} codes</span>}>
              {trip.watch.length === 0 ? (
                <p className="px-3 py-2.5 text-[0.8125rem] text-ink-soft">
                  Nothing watched yet. Either agent can call watch_equipment with a code and it
                  appears here for both windows.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 px-3 py-2.5">
                  {trip.watch.map((code) => {
                    const out = watched.find((o) => o.equipmentCode === code);
                    return (
                      <li
                        key={code}
                        className={`code border px-1.5 py-0.5 text-[0.6875rem] ${
                          out ? "border-ink bg-ink text-paper" : "border-hair-strong"
                        }`}
                      >
                        <span className={out ? "line-through" : ""}>{code}</span>{" "}
                        <span className="num">{out ? `out ${outFor(out)}` : "in service"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel title="shared timeline" meta={<span className="num">{trip.notes.length} entries</span>}>
              <ol className="max-h-80 overflow-y-auto" data-testid="timeline">
                {trip.notes.length === 0 ? (
                  <li className="px-3 py-2.5 text-[0.8125rem] text-ink-soft">
                    Nothing has happened on this trip yet. Accepting a route writes the first entry.
                  </li>
                ) : (
                  [...trip.notes].reverse().map((e, i) => (
                    <li
                      key={`${e.at}-${i}`}
                      className="grid grid-cols-[4.25rem_1fr] gap-x-3 border-b border-hair px-3 py-2 text-[0.8125rem] last:border-b-0"
                    >
                      <time className="code num text-[0.6875rem] text-ink-subtle" dateTime={e.at}>
                        {new Date(e.at).toLocaleTimeString("en-US", { hour12: false })}
                      </time>
                      <div className="min-w-0">
                        <span className="colhead">{e.by}</span>
                        <p className="mt-0.5 leading-snug">{e.text}</p>
                      </div>
                    </li>
                  ))
                )}
              </ol>
              <form
                className="flex gap-2 border-t border-hair px-3 py-2"
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
                  placeholder="Add a note both windows can read…"
                  aria-label="Add a note to the shared timeline"
                  className="flex-1 rounded-control border border-hair-strong bg-paper px-2.5 py-1.5 text-[0.8125rem] focus:border-accent"
                  data-testid="note-input"
                />
                <Button type="submit" disabled={busy !== null}>
                  Add
                </Button>
              </form>
            </Panel>

            {role === "rider" ? <ReportForm actions={actions} /> : null}

            <WebMCPTools
              role={role}
              trip={trip}
              actions={actions}
              readers={readers}
              companionKey={companionKey}
              reportForm={false}
            />

            {demo && role !== "rider" ? (
              <Panel title="demo control · ?demo=1" tone="sim">
                <p className="px-3 py-2.5 text-[0.75rem] leading-snug text-ink-soft">
                  The rider&rsquo;s window controls the simulated outage; this window sees it the
                  moment they set it, over the same trip stream as everything else.
                </p>
              </Panel>
            ) : null}

            {demo && role === "rider" ? (
              <Panel title="demo control · ?demo=1" tone="sim">
                <div className="flex flex-col gap-2.5 px-3 py-2.5">
                  <p className="text-[0.75rem] leading-snug text-ink-soft">
                    Forces one equipment code out for both windows on this trip. It is trip state,
                    shared over the same SSE stream as everything else, labelled SIMULATED
                    everywhere it appears, and never reaches the index or the MTA feed.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={simCode}
                      onChange={(e) => setSimCode(e.target.value)}
                      aria-label="Equipment to simulate out"
                      className="code rounded-control border border-hair-strong bg-paper px-2 py-1.5 text-[0.75rem]"
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
                      onClick={() => guard("sim-go", () => simulate(simCode))}
                      disabled={!simCode || busy !== null}
                      data-testid="sim-go"
                    >
                      Simulate Outage
                    </Button>
                    {simulated.length > 0 ? (
                      <Button
                        type="button"
                        variant="danger"
                        disabled={busy !== null}
                        onClick={() => guard("sim-clear", clearSimulated)}
                      >
                        Clear {simulated.length}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Panel>
            ) : null}

            <p className="text-[0.75rem] leading-snug text-ink-subtle">
              Live rows come from the MTA&rsquo;s own current-outage feed.{" "}
              <a
                className="text-accent underline underline-offset-2"
                href={MTA_STATUS_URL}
                target="_blank"
                rel="noreferrer"
              >
                MTA elevator and escalator status
              </a>
              {live?.fetchedAt ? (
                <>
                  {" · "}
                  <FetchedAgo fetchedAt={live.fetchedAt} />
                </>
              ) : null}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

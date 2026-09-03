"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Role, Trip, TripActions, TripReaders } from "@/lib/webmcp/contracts";
import { toolsForRole } from "@/lib/webmcp/tools";
import { subscribeToolLog, getToolLog, whenToolsIdle, type ToolLogEntry } from "@/lib/webmcp/log";
import { registerTools, type RegisteredInfo, type RegistrationTarget } from "@/lib/webmcp/register";
import { ensureModelContext, type WebMcpLayer } from "@/lib/webmcp/runtime";
import { ConfirmCard } from "@/components/webmcp/ConfirmCard";
import { ReportForm } from "@/components/webmcp/ReportForm";

/**
 * `@mcp-b/webmcp-types` types `execute` as `(input) => ...` because that is what the polyfill
 * calls. The spec's `ToolExecuteCallback` is `(inputObject, {signal})` and native Chrome passes
 * the second argument, so we register through this narrower local view of the same object and
 * treat `options` as optional at runtime. See docs/WEBMCP.md, "Which layer".
 */
type SpecModelContext = RegistrationTarget & {
  getTools(): Promise<Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>>;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export type WebMCPToolsProps = {
  role: Role;
  trip: Trip | null;
  actions: TripActions;
  readers: TripReaders;
  /** Hide the badge/log panel (the tools still register). */
  headless?: boolean;
  /**
   * Render the declarative report_broken_equipment form here. Rider sessions only.
   * Set false and mount <ReportForm> yourself to place it elsewhere on the page.
   */
  reportForm?: boolean;
};

const EMPTY_LOG: ToolLogEntry[] = [];

/**
 * Generations are serialized: a generation only registers after the previous one has finished
 * unregistering, otherwise the two overlap and the browser rejects the duplicate names.
 */
let generationChain: Promise<void> = Promise.resolve();

export function WebMCPTools({
  role,
  trip,
  actions,
  readers,
  headless = false,
  reportForm = true,
}: WebMCPToolsProps) {
  const [layer, setLayer] = useState<WebMcpLayer>("unavailable");
  const [context, setContext] = useState<SpecModelContext | null>(null);
  const [registered, setRegistered] = useState<RegisteredInfo[]>([]);
  const [generation, setGeneration] = useState(0);
  const [browserTools, setBrowserTools] = useState<string[]>([]);

  // Keep the latest objects without making them registration dependencies: registration is
  // keyed on role and observable trip state, never on React object identity.
  const actionsRef = useRef(actions);
  const readersRef = useRef(readers);
  const tripRef = useRef(trip);
  // Declared before the registration effect so it commits first in the same render pass.
  useEffect(() => {
    actionsRef.current = actions;
    readersRef.current = readers;
    tripRef.current = trip;
  });

  useEffect(() => {
    let live = true;
    ensureModelContext().then((r) => {
      if (!live) return;
      setLayer(r.layer);
      setContext((r.context as unknown as SpecModelContext) ?? null);
    });
    return () => {
      live = false;
    };
  }, []);

  // The four things that must change the registered tool set (and therefore fire toolchange).
  const tripId = trip?.id ?? null;
  const version = trip?.version ?? -1;
  const pendingCount = (trip?.proposals ?? []).filter((p) => p.status === "pending").length;
  const brokenKey = useMemo(() => {
    const accepted = trip?.candidates.find((r) => r.id === trip?.acceptedRouteId);
    if (!accepted) return "none";
    return `${accepted.id}:${accepted.broken ? "broken" : "ok"}:${accepted.elevators
      .filter((e) => e.currentlyOut)
      .map((e) => e.code)
      .join(",")}`;
  }, [trip]);

  useEffect(() => {
    if (!context) return;
    const controller = new AbortController();
    const defs = toolsForRole(role, tripRef.current, {
      actions: actionsRef.current,
      readers: readersRef.current,
    });

    generationChain = generationChain.then(async () => {
      if (controller.signal.aborted) return;
      const done = await registerTools(context, defs, controller.signal, (name, error) =>
        console.error(`[webmcp] could not register ${name}:`, error)
      );
      if (controller.signal.aborted) return;
      setRegistered(done);
      setGeneration((g) => g + 1);
    });

    // Aborting the signal is the only way to unregister: there is no unregisterTool(). Wait for
    // in-flight calls first, or a mutation that changes trip.version unregisters the very tool
    // that is still waiting to hand its result back.
    return () => {
      generationChain = generationChain.then(async () => {
        await whenToolsIdle();
        controller.abort();
      });
    };
  }, [context, role, tripId, version, pendingCount, brokenKey]);

  // Mirror what the browser itself reports, so the panel shows declarative form tools too.
  const refreshBrowserTools = useCallback(() => {
    if (!context) return;
    context
      .getTools()
      .then((tools) => setBrowserTools(tools.map((t) => t.name).sort()))
      .catch(() => undefined);
  }, [context]);

  useEffect(() => {
    if (!context) return;
    refreshBrowserTools();
    context.addEventListener("toolchange", refreshBrowserTools);
    return () => context.removeEventListener("toolchange", refreshBrowserTools);
  }, [context, refreshBrowserTools, generation]);

  const log = useSyncExternalStore(subscribeToolLog, getToolLog, () => EMPTY_LOG);

  // The confirm card travels with the tools: a mutating tool that cannot reach a human is a
  // mutating tool that hangs. Mounting it here means no page can register tools without it.
  const gate = (
    <>
      <ConfirmCard />
      {reportForm && role === "rider" && trip && <ReportForm actions={actions} />}
    </>
  );

  if (headless) return gate;

  return (
    <>
      {gate}
      <section
        data-webmcp-panel
        data-webmcp-layer={layer}
        data-webmcp-role={role}
        className="border border-hair-strong bg-paper"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hair bg-paper-sunk px-3 py-1.5">
          <h2 className="colhead">tools registered in this window</h2>
          <span className="flex items-baseline gap-2 text-[0.6875rem]">
            <span
              className={`code px-1 py-px text-[0.625rem] uppercase tracking-[0.1em] ${
                layer === "unavailable"
                  ? "border border-hair-strong text-ink-soft"
                  : "bg-accent text-paper"
              }`}
            >
              {layer}
            </span>
            <span className="num text-ink-soft">
              {role} · {registered.length} tools · gen {generation}
            </span>
          </span>
        </header>

        {layer === "unavailable" && (
          <p className="px-3 py-2.5 text-[0.8125rem] leading-snug">
            No <code className="code">document.modelContext</code> in this browser and the polyfill
            did not install. Turn on{" "}
            <code className="code">chrome://flags/#enable-webmcp-testing</code> in Chrome 149 or
            later, then reload.
          </p>
        )}

        {registered.length === 0 && layer !== "unavailable" ? (
          <p className="px-3 py-2.5 text-[0.8125rem] text-ink-soft">
            Registering this session&rsquo;s tools…
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hair">
                <th scope="col" className="colhead w-8 px-3 py-1 font-semibold">
                  <span className="sr-only">Mutating</span>
                </th>
                <th scope="col" className="colhead px-0 py-1 font-semibold">
                  tool
                </th>
                <th scope="col" className="colhead px-3 py-1 text-right font-semibold">
                  effect
                </th>
              </tr>
            </thead>
            <tbody>
              {registered.map((t) => (
                <tr key={t.name} className="border-b border-hair last:border-b-0">
                  <td className="px-3 py-1">
                    <span
                      aria-hidden
                      className={`inline-block h-2.5 w-2.5 border border-ink ${
                        t.readOnlyHint ? "" : "bg-ink"
                      }`}
                    />
                  </td>
                  <td className="code py-1 text-[0.75rem]">{t.name}</td>
                  <td className="py-1 pr-3 text-right text-[0.6875rem] text-ink-soft">
                    {t.untrusted ? (
                      <span className="mr-2 border border-tier-watch px-1 text-tier-watch">
                        untrusted output
                      </span>
                    ) : null}
                    {t.readOnlyHint ? "reads" : "writes"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {browserTools.length > 0 && (
          <p className="code border-t border-hair px-3 py-1.5 text-[0.6875rem] leading-relaxed text-ink-subtle">
            document.modelContext.getTools() → {browserTools.join(", ")}
          </p>
        )}

        <div className="border-t border-hair-strong">
          <h3 className="colhead border-b border-hair bg-paper-sunk px-3 py-1.5">
            tool log · <span className="num">{log.length}</span>
          </h3>
          {log.length === 0 ? (
            <p className="px-3 py-2.5 text-[0.8125rem] text-ink-soft">
              No tool call has come in yet. Ask the agent for a route and the first line lands here.
            </p>
          ) : (
            <ol className="max-h-72 overflow-y-auto bg-ink text-paper">
              {log.map((e) => (
                <li key={e.id} className="code border-b border-paper/10 px-3 py-1.5 text-[0.6875rem] leading-relaxed last:border-b-0">
                  <span className={e.ok ? "text-paper/50" : "text-paper"} aria-hidden>
                    {e.ok ? "$" : "!"}
                  </span>{" "}
                  <span className="font-medium">{e.name}</span>{" "}
                  <span className="num text-paper/50">{e.durationMs}ms</span>
                  <div className="break-all text-paper/55">{JSON.stringify(e.args)}</div>
                  {!e.ok && <div className="text-tier-watch">{e.error}</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}

export default WebMCPTools;

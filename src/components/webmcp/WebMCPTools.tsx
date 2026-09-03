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
      className="border-4 border-black bg-white text-black"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-4 border-black bg-black px-3 py-2 text-white">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em]">
          WebMCP: {layer === "native" ? "native" : layer === "polyfill" ? "polyfill" : "unavailable"}
        </h2>
        <span className="font-mono text-xs">
          {role} session &middot; {registered.length} tools &middot; gen {generation}
        </span>
      </header>

      {layer === "unavailable" && (
        <p className="px-3 py-2 text-sm">
          No <code>document.modelContext</code> in this browser and the polyfill did not install.
          Enable <code>chrome://flags/#enable-webmcp-testing</code> in Chrome 149+.
        </p>
      )}

      <ul className="divide-y-2 divide-black">
        {registered.map((t) => (
          <li key={t.name} className="flex items-center justify-between gap-3 px-3 py-1.5 font-mono text-xs">
            <span>{t.name}</span>
            <span className="flex gap-2">
              {t.untrusted && <span className="bg-amber-300 px-1">untrusted output</span>}
              <span className={t.readOnlyHint ? "text-neutral-600" : "bg-black px-1 text-white"}>
                {t.readOnlyHint ? "readOnlyHint: true" : "readOnlyHint: false"}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {browserTools.length > 0 && (
        <p className="border-t-2 border-black px-3 py-1.5 font-mono text-[11px] leading-snug text-neutral-700">
          document.modelContext.getTools(): {browserTools.join(", ")}
        </p>
      )}

      <div className="border-t-4 border-black">
        <h3 className="px-3 py-1.5 font-mono text-xs uppercase tracking-[0.2em]">
          Tool log ({log.length})
        </h3>
        {log.length === 0 ? (
          <p className="px-3 pb-2 text-xs text-neutral-600">
            No tool calls yet in this session.
          </p>
        ) : (
          <ol className="divide-y divide-neutral-300 border-t-2 border-black">
            {log.map((e) => (
              <li key={e.id} className="px-3 py-1.5 font-mono text-[11px] leading-snug">
                <span className={e.ok ? "text-neutral-900" : "bg-red-600 px-1 text-white"}>
                  {e.ok ? "ok" : "error"}
                </span>{" "}
                <strong>{e.name}</strong> {e.durationMs}ms
                <br />
                <span className="text-neutral-600">{JSON.stringify(e.args)}</span>
                {!e.ok && <span className="block text-red-700">{e.error}</span>}
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

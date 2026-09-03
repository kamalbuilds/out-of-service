"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Role, Trip, TripActions, TripReaders } from "@/lib/webmcp/contracts";
import { toolsForRole } from "@/lib/webmcp/tools";
import { withToolLog, subscribeToolLog, getToolLog, type ToolLogEntry } from "@/lib/webmcp/log";
import { ensureModelContext, type WebMcpLayer } from "@/lib/webmcp/runtime";

/**
 * `@mcp-b/webmcp-types` types `execute` as `(input) => ...` because that is what the polyfill
 * calls. The spec's `ToolExecuteCallback` is `(inputObject, {signal})` and native Chrome passes
 * the second argument, so we register through this narrower local view of the same object and
 * treat `options` as optional at runtime. See docs/WEBMCP.md, "Which layer".
 */
type SpecTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
};

type SpecModelContext = {
  registerTool(tool: SpecTool, options?: { signal?: AbortSignal }): Promise<void>;
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
};

type RegisteredInfo = { name: string; readOnlyHint: boolean; untrusted: boolean };

const EMPTY_LOG: ToolLogEntry[] = [];

export function WebMCPTools({ role, trip, actions, readers, headless = false }: WebMCPToolsProps) {
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

    (async () => {
      const done: RegisteredInfo[] = [];
      for (const def of defs) {
        // Declarative tools come from <form toolname>, registered by the browser itself.
        // Registering them here too would collide on name (InvalidStateError).
        if (def.declarative) continue;
        if (controller.signal.aborted) return;
        try {
          await context.registerTool(
            {
              name: def.name,
              title: def.title,
              description: def.description,
              inputSchema: def.inputSchema,
              annotations: def.annotations,
              execute: withToolLog(def.name, def.execute),
            },
            { signal: controller.signal }
          );
          done.push({
            name: def.name,
            readOnlyHint: def.annotations.readOnlyHint,
            untrusted: def.annotations.untrustedContentHint,
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error(`[webmcp] could not register ${def.name}:`, error);
        }
      }
      if (controller.signal.aborted) return;
      setRegistered(done);
      setGeneration((g) => g + 1);
    })();

    // Aborting the signal is the only way to unregister: there is no unregisterTool().
    return () => controller.abort();
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

  if (headless) return null;

  return (
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
  );
}

export default WebMCPTools;

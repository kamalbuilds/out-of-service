/**
 * Which WebMCP layer is live in this tab.
 *
 * Detection has to happen before the polyfill installs itself, otherwise every tab reports
 * "native". `detectLayer()` reads `document.modelContext` once, at module evaluation on the
 * client, and caches the answer; `ensureModelContext()` then installs the MCP-B polyfill only
 * when the native object was absent.
 */
import type { ModelContext } from "@mcp-b/webmcp-types";

export type WebMcpLayer = "native" | "polyfill" | "unavailable";

let nativeAtLoad: boolean | null = null;
let layer: WebMcpLayer | null = null;

function readNative(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean((document as Document & { modelContext?: unknown }).modelContext);
}

/** True when `document.modelContext` existed before we touched anything. */
export function wasNativeAtLoad(): boolean {
  if (nativeAtLoad === null) nativeAtLoad = readNative();
  return nativeAtLoad;
}

if (typeof document !== "undefined") wasNativeAtLoad();

export function getLayer(): WebMcpLayer {
  return layer ?? (typeof document === "undefined" ? "unavailable" : wasNativeAtLoad() ? "native" : "unavailable");
}

/**
 * Returns the ModelContext for this document, installing `@mcp-b/webmcp-polyfill` when Chrome
 * has not shipped/flagged the native one. Safe to call repeatedly; the polyfill is idempotent
 * and refuses to replace a native context.
 */
export async function ensureModelContext(): Promise<{ layer: WebMcpLayer; context: ModelContext | null }> {
  if (typeof document === "undefined") return { layer: "unavailable", context: null };

  const native = wasNativeAtLoad();
  if (native) {
    layer = "native";
    return { layer, context: (document as Document & { modelContext?: ModelContext }).modelContext ?? null };
  }

  try {
    const { initializeWebMCPPolyfill } = await import("@mcp-b/webmcp-polyfill");
    initializeWebMCPPolyfill();
  } catch {
    layer = "unavailable";
    return { layer, context: null };
  }

  const context = (document as Document & { modelContext?: ModelContext }).modelContext ?? null;
  layer = context ? "polyfill" : "unavailable";
  return { layer, context };
}

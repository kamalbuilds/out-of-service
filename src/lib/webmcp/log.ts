/** In-page log of the last 20 tool invocations, so a judge can see calls land without DevTools. */

export type ToolLogEntry = {
  id: number;
  name: string;
  args: Record<string, unknown>;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  result?: string;
  error?: string;
};

const MAX = 20;
let entries: ToolLogEntry[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function emit() {
  for (const l of listeners) l();
}

export function subscribeToolLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToolLog(): ToolLogEntry[] {
  return entries;
}

export function resetToolLog() {
  entries = [];
  emit();
}

function preview(value: unknown, max = 240): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function push(entry: ToolLogEntry) {
  entries = [entry, ...entries].slice(0, MAX);
  emit();
}

/**
 * Wrap a tool's execute so every call is timed and logged. Errors are re-thrown unchanged:
 * the model must still see the actionable message the tool threw.
 */
export function withToolLog<
  T extends (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>,
>(name: string, execute: T): T {
  const wrapped = async (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
    const startedAt = Date.now();
    const id = ++seq;
    try {
      const result = await execute(input, options);
      push({
        id,
        name,
        args: input ?? {},
        startedAt,
        durationMs: Date.now() - startedAt,
        ok: true,
        result: preview(result),
      });
      return result;
    } catch (error) {
      push({
        id,
        name,
        args: input ?? {},
        startedAt,
        durationMs: Date.now() - startedAt,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
  return wrapped as T;
}

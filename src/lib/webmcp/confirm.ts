/**
 * Confirm-before-mutate.
 *
 * WebMCP's ToolAnnotations has exactly two members, readOnlyHint and untrustedContentHint.
 * There is no destructiveHint and no shipped `requestUserInteraction()`, so a site that wants
 * a human in the loop for a mutation has to build the gate itself, inside `execute`.
 * `confirm()` below suspends the tool call, puts a card in the page, and resolves only when
 * a human clicks. Rejection carries a sentence the model can act on, not a status code.
 */

export type ConfirmDetail = { label: string; value: string };

export type ConfirmRequest = {
  title: string;
  summary: string;
  details?: ConfirmDetail[];
  confirmLabel?: string;
  rejectLabel?: string;
  /** Prefix of the rejection message handed back to the model, e.g. "The rider rejected the reroute". */
  rejectionPrefix?: string;
  /** The AbortSignal the browser handed to `execute`. Aborting closes the card. */
  signal?: AbortSignal;
};

export type PendingConfirm = ConfirmRequest & {
  id: string;
  createdAt: number;
  resolve: () => void;
  reject: (reason: string) => void;
};

export class ToolRejectedError extends Error {
  readonly rejectedByHuman = true;
  constructor(message: string) {
    super(message);
    this.name = "ToolRejectedError";
  }
}

export class ToolCancelledError extends Error {
  readonly cancelled = true;
  constructor(message: string) {
    super(message);
    this.name = "ToolCancelledError";
  }
}

type Listener = () => void;

let queue: PendingConfirm[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function emit() {
  for (const l of listeners) l();
}

export function subscribeConfirms(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConfirmQueue(): PendingConfirm[] {
  return queue;
}

function drop(id: string) {
  const next = queue.filter((p) => p.id !== id);
  if (next.length !== queue.length) {
    queue = next;
    emit();
  }
}

/**
 * Suspend a tool call until a human clicks Confirm or Reject in the in-page card.
 * Resolves on Confirm. Rejects with `ToolRejectedError` (message written for the model)
 * on Reject, and with `ToolCancelledError` when the caller aborts the execution signal.
 */
export function confirm(request: ConfirmRequest): Promise<void> {
  const { signal } = request;
  if (signal?.aborted) {
    return Promise.reject(
      new ToolCancelledError("The agent cancelled this call before the human saw the confirmation card.")
    );
  }

  return new Promise<void>((resolveOuter, rejectOuter) => {
    const id = `confirm-${++seq}`;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      drop(id);
      fn();
    };

    function onAbort() {
      finish(() =>
        rejectOuter(
          new ToolCancelledError(
            "The agent cancelled this call while the confirmation card was open; nothing was changed."
          )
        )
      );
    }

    const pending: PendingConfirm = {
      ...request,
      id,
      createdAt: Date.now(),
      resolve: () => finish(() => resolveOuter()),
      reject: (reason: string) => {
        const prefix = request.rejectionPrefix ?? "The person at this screen rejected the action";
        const detail = reason.trim() ? reason.trim() : "no reason given";
        finish(() => rejectOuter(new ToolRejectedError(`${prefix}: ${detail}`)));
      },
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    queue = [...queue, pending];
    emit();
  });
}

/** Test/SSR helper: drop every open card. */
export function resetConfirms() {
  for (const p of queue) p.reject("the page was reset");
  queue = [];
  emit();
}

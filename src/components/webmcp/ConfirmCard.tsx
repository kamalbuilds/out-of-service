"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getConfirmQueue,
  subscribeConfirms,
  type PendingConfirm,
} from "@/lib/webmcp/confirm";

const EMPTY: PendingConfirm[] = [];

/**
 * The human half of confirm-before-mutate. A mutating tool's `execute` awaits `confirm(...)`,
 * which parks the call here until someone presses a button. Mount once, high in the tree.
 */
export function ConfirmCard() {
  const queue = useSyncExternalStore(subscribeConfirms, getConfirmQueue, () => EMPTY);
  const pending = queue[0];

  if (!pending) return null;
  return <Card key={pending.id} pending={pending} depth={queue.length - 1} />;
}

function Card({ pending, depth }: { pending: PendingConfirm; depth: number }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") pending.reject("dismissed with Escape");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={pending.title}
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:p-6"
    >
      <div className="w-full max-w-xl border-4 border-black bg-white text-black shadow-[8px_8px_0_0_#000]">
        <div className="flex items-baseline justify-between gap-4 border-b-4 border-black bg-black px-4 py-2 text-white">
          <span className="font-mono text-xs uppercase tracking-[0.2em]">agent wants to act</span>
          {depth > 0 && (
            <span className="font-mono text-xs">{depth} more waiting</span>
          )}
        </div>

        <div className="px-4 py-4">
          <h2 className="text-2xl font-black leading-tight">{pending.title}</h2>
          <p className="mt-1 text-lg">{pending.summary}</p>

          {pending.details && pending.details.length > 0 && (
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 border-t-2 border-black pt-3 font-mono text-sm">
              {pending.details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="uppercase tracking-wide text-neutral-600">{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {rejecting && (
            <label className="mt-4 block">
              <span className="font-mono text-xs uppercase tracking-wide">
                Why not? The agent is told this reason.
              </span>
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="that transfer is too long for me"
                className="mt-1 w-full border-2 border-black px-2 py-2 text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter") pending.reject(reason);
                }}
              />
            </label>
          )}
        </div>

        <div className="flex gap-2 border-t-4 border-black p-3">
          <button
            type="button"
            onClick={() => pending.resolve()}
            className="flex-1 bg-black px-4 py-3 text-lg font-bold uppercase tracking-wide text-white"
          >
            {pending.confirmLabel ?? "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => (rejecting ? pending.reject(reason) : setRejecting(true))}
            className="flex-1 border-2 border-black px-4 py-3 text-lg font-bold uppercase tracking-wide"
          >
            {rejecting ? "Send rejection" : (pending.rejectLabel ?? "Reject")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmCard;

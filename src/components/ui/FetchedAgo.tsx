"use client";

import { useEffect, useState } from "react";

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * A status board says when it last heard from the source. Server-rendered as the
 * absolute clock time, then it counts up in the browser off the real fetchedAt.
 */
export function FetchedAgo({ fetchedAt }: { fetchedAt: string }) {
  const at = new Date(fetchedAt);
  const [rel, setRel] = useState<string | null>(null);

  useEffect(() => {
    const t = at.getTime();
    if (!Number.isFinite(t)) return;
    const tick = () => setRel(ago(Date.now() - t));
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [fetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <time className="code num" dateTime={fetchedAt} suppressHydrationWarning>
      fetched {rel ?? at.toLocaleTimeString("en-US", { hour12: false })}
    </time>
  );
}

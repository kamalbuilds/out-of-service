"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** Rider only: the URL that opens this trip in the companion's session. */
export function CompanionLink({ tripId }: { tripId: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/t/${tripId}?role=companion`;
  const href = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  return (
    <div className="border-2 border-ink">
      <div className="label border-b-2 border-ink px-3 py-1.5">companion link</div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <code className="flex-1 break-all font-mono text-xs">{href}</code>
        <Button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(href);
            } catch {
              /* clipboard blocked: the URL is on screen to copy by hand */
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "copied" : "copy"}
        </Button>
        <a
          href={path}
          className="border-2 border-ink px-3 py-1.5 text-sm font-bold uppercase tracking-wide hover:bg-ink hover:text-white"
        >
          open
        </a>
      </div>
      <p className="border-t-2 border-ink px-3 py-2 text-xs text-muted">
        Whoever opens this link gets the companion session: their agent can propose a reroute and
        watch equipment, but the accept tools are not registered in that window, and the server
        rejects an accept from a companion even if one is forged.
      </p>
    </div>
  );
}

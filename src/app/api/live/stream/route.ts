import { fetchLiveOutages } from "@/lib/live/mta";
import { getEquipmentMaster } from "@/lib/live/equipmentMaster";
import { joinLiveWithMaster } from "@/lib/live/join";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 30_000;
// Vercel Fluid/serverless functions have a hard execution ceiling and a
// long-lived HTTP connection ties up one function invocation the whole
// time. Rather than approach that ceiling, this stream self-closes after 5
// minutes; the WebMCP `toolchange` listener on the client is expected to
// reconnect (EventSource does this automatically on a clean close only if
// the server does NOT send a final error -- we close the stream cleanly so
// the browser's default reconnect behavior kicks in).
const MAX_STREAM_LIFETIME_MS = 5 * 60_000;

async function snapshot() {
  const [liveEnvelope, equipmentMaster] = await Promise.all([
    fetchLiveOutages(),
    getEquipmentMaster(),
  ]);
  const { outages, coverage } = joinLiveWithMaster(liveEnvelope.outages, equipmentMaster);
  return {
    fetchedAt: liveEnvelope.fetchedAt,
    stale: liveEnvelope.stale,
    sourceUrl: liveEnvelope.sourceUrl,
    coverage,
    outages,
  };
}

function currentEquipmentSet(outages: { equipmentCode: string; isCurrent: boolean }[]): Set<string> {
  return new Set(outages.filter((o) => o.isCurrent).map((o) => o.equipmentCode));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let intervalHandle: ReturnType<typeof setInterval> | undefined;
  let lifetimeHandle: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (intervalHandle) clearInterval(intervalHandle);
        if (lifetimeHandle) clearTimeout(lifetimeHandle);
        try {
          controller.close();
        } catch {
          // already closed by the client disconnecting
        }
      };

      let lastCurrent: Set<string>;
      try {
        const initial = await snapshot();
        lastCurrent = currentEquipmentSet(initial.outages);
        safeEnqueue(sseEvent("snapshot", initial));
      } catch (err) {
        safeEnqueue(
          sseEvent("error", {
            message: err instanceof Error ? err.message : "Failed to fetch live outages",
          }),
        );
        cleanup();
        return;
      }

      intervalHandle = setInterval(async () => {
        if (closed) return;
        try {
          const next = await snapshot();
          const nextCurrent = currentEquipmentSet(next.outages);
          if (!sameSet(lastCurrent, nextCurrent)) {
            lastCurrent = nextCurrent;
            safeEnqueue(sseEvent("change", next));
          } else {
            safeEnqueue(sseEvent("heartbeat", { fetchedAt: next.fetchedAt }));
          }
        } catch (err) {
          safeEnqueue(
            sseEvent("error", {
              message: err instanceof Error ? err.message : "Failed to refresh live outages",
            }),
          );
        }
      }, POLL_INTERVAL_MS);

      lifetimeHandle = setTimeout(cleanup, MAX_STREAM_LIFETIME_MS);
    },
    cancel() {
      closed = true;
      if (intervalHandle) clearInterval(intervalHandle);
      if (lifetimeHandle) clearTimeout(lifetimeHandle);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

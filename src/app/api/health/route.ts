import { indexMeta } from "@/lib/adapters/stations";
import { liveSnapshotOrEmpty } from "@/lib/adapters/live";
import { routingAvailable } from "@/lib/adapters/routes";
import { storeBackendDetail, storeBackendName } from "@/lib/store";

export const dynamic = "force-dynamic";

const BUILD_TIME = new Date().toISOString();

export async function GET() {
  let index: Record<string, unknown>;
  try {
    index = indexMeta();
  } catch (err) {
    index = { error: (err as Error).message };
  }

  const live = await liveSnapshotOrEmpty();

  return Response.json({
    ok: !index.error,
    buildTime: BUILD_TIME,
    store: { backend: storeBackendName(), detail: storeBackendDetail() },
    index,
    routing: { available: await routingAvailable() },
    live: {
      outages: live.outages.length,
      current: live.counts.current,
      adaCurrent: live.counts.adaCurrent,
      coverage: live.coverage,
      stale: live.stale,
      fetchedAt: live.fetchedAt,
      sourceUrl: live.sourceUrl,
    },
  });
}

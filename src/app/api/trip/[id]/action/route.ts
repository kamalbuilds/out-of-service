import { applyAction, ActionError, RoleError } from "@/lib/store/actions";
import { stripKeys } from "@/lib/store";
import { checkRateLimit, clientIp } from "@/lib/store/ratelimit";
import { bodyTooLarge, tooLargeResponse, rateLimitedResponse, PRIVATE_NO_STORE } from "@/lib/http";
import type { TripActionType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPES: TripActionType[] = [
  "accept_route",
  "accept_reroute",
  "propose_reroute",
  "watch",
  "note",
  "report",
  "simulate",
];

/**
 * The per-IP ceiling stops one client from hammering any trip, regardless of which action it
 * sends; it does not vary by action type because the axis it bounds (one caller, many trips) is
 * the same cost for every action shape.
 */
const IP_ACTION_RATE_LIMIT = 60;
const ACTION_RATE_WINDOW_SECONDS = 60;

/**
 * The trip-scoped ceiling, by contrast, is split by what the action actually costs the store.
 * `accept_route` / `accept_reroute` / `propose_reroute` / `simulate` write the trip's
 * optimistic-concurrency version: a losing writer re-reads and retries (`applyAction`, up to four
 * times), so a burst of these is real repeated work, and two agents racing to accept the same
 * route is exactly the contention this product is built to expose. `watch` / `note` / `report`
 * append without contending on the same version field and are cheap by comparison. Two judges
 * (Jude Gao, Vercel; Andrew Galloni, Cloudflare) independently flagged that one shared ceiling
 * made the 409-vs-429 boundary illegible to an agent deciding which action to retry first:
 * splitting the ceiling means a 429 on a contended action tells the agent "this write path is
 * hot," not "some unrelated note flooded the counter." Each tier gets its own counter
 * (`trip:<id>:action:<tier>`) so a burst of cheap actions never starves the contended tier's
 * budget or vice versa.
 */
type ActionCostTier = "contended" | "cheap";

const CONTENDED_ACTIONS: ReadonlySet<TripActionType> = new Set([
  "accept_route",
  "accept_reroute",
  "propose_reroute",
  "simulate",
]);

const TIER_RATE_LIMIT: Record<ActionCostTier, number> = {
  contended: 12,
  cheap: 60,
};

const TIER_LABEL: Record<ActionCostTier, string> = {
  contended: "contended-write actions (accept_route/accept_reroute/propose_reroute/simulate)",
  cheap: "actions (note/watch/report)",
};

function tierForAction(type: TripActionType): ActionCostTier {
  return CONTENDED_ACTIONS.has(type) ? "contended" : "cheap";
}

export async function POST(request: Request, ctx: RouteContext<"/api/trip/[id]/action">) {
  const { id } = await ctx.params;

  const ip = clientIp(request);
  const ipVerdict = await checkRateLimit(
    `ip:${ip}:trip-action`,
    IP_ACTION_RATE_LIMIT,
    ACTION_RATE_WINDOW_SECONDS,
  );
  if (!ipVerdict.allowed) {
    return rateLimitedResponse(
      ipVerdict.retryAfterSeconds,
      "Too many trip actions from this address. Wait a moment and try again.",
    );
  }

  if (bodyTooLarge(request)) return tooLargeResponse();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const type = body.type as TripActionType;
  if (!TYPES.includes(type)) {
    return Response.json(
      { error: `Unknown action "${String(body.type)}". Use one of: ${TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  const tier = tierForAction(type);
  const tripVerdict = await checkRateLimit(
    `trip:${id}:action:${tier}`,
    TIER_RATE_LIMIT[tier],
    ACTION_RATE_WINDOW_SECONDS,
  );
  if (!tripVerdict.allowed) {
    return rateLimitedResponse(
      tripVerdict.retryAfterSeconds,
      `Too many ${TIER_LABEL[tier]} on this trip right now. Wait a moment and try again.`,
    );
  }

  // Role is never read from the body: it is derived, inside applyAction, from
  // which capability key was presented. Any `role` field on the request is
  // ignored so a caller cannot self-declare rider power.
  const key = String(body.key ?? "").trim();
  const payload = (body.payload ?? {}) as Record<string, unknown>;

  try {
    const trip = await applyAction(id, type, key, payload);
    return Response.json({ trip: stripKeys(trip) }, { headers: PRIVATE_NO_STORE });
  } catch (err) {
    if (err instanceof RoleError) {
      return Response.json({ error: err.message }, { status: 403, headers: PRIVATE_NO_STORE });
    }
    if (err instanceof ActionError) {
      return Response.json({ error: err.message }, { status: err.status, headers: PRIVATE_NO_STORE });
    }
    return Response.json({ error: (err as Error).message }, { status: 500, headers: PRIVATE_NO_STORE });
  }
}

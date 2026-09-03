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
 * 60 requests per minute, checked twice: once per caller IP (stop one client from hammering any
 * trip) and once per trip id (stop many clients, or many keys on the same trip, from hammering
 * one trip's write path — the optimistic-concurrency retry in `applyAction` is real work, not
 * free). Either ceiling alone is bypassable (many IPs on one trip, or one IP across many trips);
 * together they bound both axes an abusive caller could pick.
 */
const ACTION_RATE_LIMIT = 60;
const ACTION_RATE_WINDOW_SECONDS = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/trip/[id]/action">) {
  const { id } = await ctx.params;

  const ip = clientIp(request);
  const ipVerdict = await checkRateLimit(
    `ip:${ip}:trip-action`,
    ACTION_RATE_LIMIT,
    ACTION_RATE_WINDOW_SECONDS,
  );
  if (!ipVerdict.allowed) {
    return rateLimitedResponse(
      ipVerdict.retryAfterSeconds,
      "Too many trip actions from this address. Wait a moment and try again.",
    );
  }
  const tripVerdict = await checkRateLimit(
    `trip:${id}:action`,
    ACTION_RATE_LIMIT,
    ACTION_RATE_WINDOW_SECONDS,
  );
  if (!tripVerdict.allowed) {
    return rateLimitedResponse(
      tripVerdict.retryAfterSeconds,
      "Too many actions on this trip right now. Wait a moment and try again.",
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

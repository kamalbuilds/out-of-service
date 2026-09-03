import { applyAction, ActionError, RoleError } from "@/lib/store/actions";
import { parseRole } from "@/lib/adapters/input";
import type { TripActionType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPES: TripActionType[] = [
  "accept_route",
  "accept_reroute",
  "propose_reroute",
  "watch",
  "note",
  "report",
];

export async function POST(request: Request, ctx: RouteContext<"/api/trip/[id]/action">) {
  const { id } = await ctx.params;

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

  const role = parseRole(body.role);
  const payload = (body.payload ?? {}) as Record<string, unknown>;

  try {
    const trip = await applyAction(id, type, role, payload);
    return Response.json({ trip });
  } catch (err) {
    if (err instanceof RoleError) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ActionError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

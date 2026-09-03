/**
 * Small shared pieces for the trip write/read routes, kept out of each route file so the same
 * ceiling and header can't drift between `/api/trip` and `/api/trip/:id/action`.
 */

/** A trip JSON response carries another person's notes, reports, and (once) capability keys. */
export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * Best-effort request-body ceiling, checked against `Content-Length` before `request.json()`
 * ever runs, so an oversized body is rejected before it is fully buffered and parsed rather than
 * after. Generous relative to any single field's own cap (the largest realistic body is a
 * `report` action: equipment code + description, both capped in `src/lib/store/actions.ts`,
 * plus JSON overhead) so a legitimate request never trips it, while a multi-megabyte body does.
 * A request without `Content-Length` (rare for a same-origin JSON POST) falls through to this
 * check and is still bounded by each field's own length cap once parsed.
 */
const MAX_BODY_BYTES = 20_000;

export function bodyTooLarge(request: Request): boolean {
  const len = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(len) && len > MAX_BODY_BYTES;
}

export function tooLargeResponse() {
  return Response.json(
    { error: `Request body is too large. Keep it under ${MAX_BODY_BYTES} bytes.` },
    { status: 413 },
  );
}

export function rateLimitedResponse(retryAfterSeconds: number, message: string) {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.round(retryAfterSeconds))) } },
  );
}

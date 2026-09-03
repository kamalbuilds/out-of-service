import type { Constraints, Role } from "@/lib/types";

export function parseConstraints(raw: unknown): Constraints {
  const c = (raw ?? {}) as Record<string, unknown>;
  const maxTransfers = Number(c.maxTransfers ?? 2);
  return {
    wheelchair: c.wheelchair === undefined ? true : Boolean(c.wheelchair),
    stroller: c.stroller === undefined ? undefined : Boolean(c.stroller),
    avoidEscalators: Boolean(c.avoidEscalators ?? false),
    maxTransfers: Number.isFinite(maxTransfers)
      ? Math.min(4, Math.max(0, Math.trunc(maxTransfers)))
      : 2,
  };
}

export function parseRole(raw: unknown): Role {
  return raw === "companion" ? "companion" : "rider";
}

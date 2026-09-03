import { randomBytes } from "node:crypto";
import type {
  Constraints,
  Route,
  TimelineEvent,
  Trip,
} from "@/lib/types";
import { backend, type BackendName } from "./backend";

export class StaleWriteError extends Error {
  constructor(
    readonly id: string,
    readonly stored: number,
    readonly attempted: number,
  ) {
    super(
      `Trip ${id} was modified by someone else: the store holds version ${stored}, ` +
        `this write is based on version ${attempted - 1}. Re-read the trip and retry.`,
    );
    this.name = "StaleWriteError";
  }
}

export function storeBackendName(): BackendName {
  return backend().name;
}

export function storeBackendDetail(): string {
  const b = backend();
  return `${b.name}: ${b.detail}`;
}

export async function getTrip(id: string): Promise<Trip | null> {
  if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) return null;
  return backend().read(id);
}

/**
 * Optimistic write. `trip.version` must be exactly one higher than the stored
 * version (or the trip must not exist yet and arrive at version 1).
 */
export async function putTrip(trip: Trip): Promise<Trip> {
  const existing = await getTrip(trip.id);
  const storedVersion = existing?.version ?? 0;
  if (trip.version !== storedVersion + 1) {
    throw new StaleWriteError(trip.id, storedVersion, trip.version);
  }
  const won = await backend().write(trip);
  if (!won) {
    throw new StaleWriteError(trip.id, trip.version, trip.version);
  }
  return trip;
}

export type CreateTripArgs = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  constraints: Constraints;
  candidates: Route[];
};

export function newTripId(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * A per-link capability token, unguessable and unrelated to the trip id (which is
 * visible in both the rider and companion URL and is not a secret). `role` is
 * derived from which of these a caller presents; see `src/lib/store/actions.ts`.
 */
export function newCapabilityKey(): string {
  return randomBytes(18).toString("base64url");
}

/** Strip both capability keys before a trip is ever serialised to GET, SSE, or a tool result. */
export function stripKeys(trip: Trip): Trip {
  const { riderKey: _riderKey, companionKey: _companionKey, ...rest } = trip;
  return { ...rest, riderKey: "", companionKey: "" };
}

export async function createTrip(args: CreateTripArgs): Promise<Trip> {
  const now = new Date().toISOString();
  const seed: TimelineEvent = {
    at: now,
    by: "system",
    kind: "trip_created",
    text: `Trip created: ${args.fromName} to ${args.toName}. ${args.candidates.length} candidate route${args.candidates.length === 1 ? "" : "s"} scored.`,
  };
  const trip: Trip = {
    id: newTripId(),
    createdAt: now,
    from: args.from,
    to: args.to,
    fromName: args.fromName,
    toName: args.toName,
    constraints: args.constraints,
    candidates: args.candidates,
    proposals: [],
    watch: [],
    notes: [seed],
    reports: [],
    riderKey: newCapabilityKey(),
    companionKey: newCapabilityKey(),
    simulatedOut: [],
    version: 1,
  };
  return putTrip(trip);
}

export async function listTripIds(): Promise<string[]> {
  return backend().listIds();
}

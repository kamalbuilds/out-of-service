import type {
  Constraints,
  Route,
  TimelineEvent,
  Trip,
} from "@/lib/types";
import { backend, type BackendName } from "./backend";

const PREFIX = "oos:trip:";

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
  const raw = await backend().get(PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Trip;
  } catch {
    throw new Error(`Trip ${id} is stored but is not valid JSON.`);
  }
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
  await backend().set(PREFIX + trip.id, JSON.stringify(trip));
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
    version: 1,
  };
  return putTrip(trip);
}

export async function listTripIds(): Promise<string[]> {
  const keys = await backend().keys(PREFIX);
  return keys.map((k) => k.slice(PREFIX.length));
}

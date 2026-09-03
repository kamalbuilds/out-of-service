import { EquipmentRecord, NextAda, isAdaElevator, loadEquipment } from "./equipment";

export type Direction = "north" | "south";

/** NYCT revenue subway routes that can appear in `linesservedbyelevator` / `nextada*`. */
export const SUBWAY_LINES = new Set([
  "1", "2", "3", "4", "5", "6", "7",
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "L", "M", "N", "Q", "R", "S", "W", "Z",
]);

export type StationNode = {
  /** `stationcomplexid` from the master. Stable id used everywhere downstream. */
  id: string;
  name: string;
  /** Every distinct station name that rolls up into this complex. */
  names: string[];
  /** `elevatormrn` values that resolve to this complex. `nextada*` targets are MRNs, not complex ids. */
  mrns: string[];
  gtfsStopIds: string[];
  lines: string[];
  /** Non-subway services reachable here (LIRR, METRO-NORTH, PATH, SIR, AIRTRAIN). */
  otherServices: string[];
  /** equipmentno of every active ADA elevator in the complex. */
  elevators: string[];
};

export type RideEdge = {
  from: string;
  to: string;
  line: string;
  direction: Direction;
  /** true when the edge was mirrored from the opposite direction rather than asserted by the master. */
  inferred: boolean;
};

/** Literal complex-internal transfer: two different GTFS stops under one `stationcomplexid`. */
export type StopTransferEdge = { complex: string; fromStop: string; toStop: string };

/** The transfer the router actually costs: change of line inside one complex. */
export type LineTransferEdge = { complex: string; fromLine: string; toLine: string };

export type UnparsedEdge = {
  equipment: string;
  station: string;
  field: "nextadanorth" | "nextadasouth";
  raw: string;
  reason: "malformed" | "unknown-target" | "self-loop" | "unknown-line";
};

export type GraphStats = {
  nodes: number;
  rideEdges: number;
  assertedRideEdges: number;
  inferredRideEdges: number;
  stopTransferEdges: number;
  lineTransferEdges: number;
  lines: number;
  elevators: number;
  adaElevatorRows: number;
  equipmentRows: number;
  unparsed: number;
};

export type StationGraph = {
  nodes: Map<string, StationNode>;
  rideEdges: RideEdge[];
  stopTransfers: StopTransferEdge[];
  lineTransfers: LineTransferEdge[];
  /** nodeId -> line -> outgoing ride edges */
  adjacency: Map<string, Map<string, RideEdge[]>>;
  /** equipmentno -> raw master row, active ADA elevators only */
  elevators: Map<string, EquipmentRecord>;
  /** nodeId -> active ADA elevator rows in that complex */
  elevatorsByNode: Map<string, EquipmentRecord[]>;
  byMrn: Map<string, string>;
  byGtfsStop: Map<string, string>;
  byName: Map<string, string>;
  unparsed: UnparsedEdge[];
  stats: GraphStats;
};

/** `EL293` / `Jackson Hts-Roosevelt Av` -> `jacksonhtsrooseveltav` for tolerant lookups. */
export function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitList(v: string | null | undefined): string[] {
  if (!v) return [];
  return String(v)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

const GROUP = /^\s*(\d+)\s*,\s*(.+?)\s*$/;

/**
 * Parses a `nextadanorth` / `nextadasouth` cell.
 *
 * Every non-empty value in the master follows: groups separated by `/`, each group
 * `<mrn>, <line>[, <line>...]`. "117, L" is one group; "215, B, D / 387, 4" is two.
 * Returns one {target,line} per line token.
 */
export function parseNextAda(value: NextAda): { targets: Array<{ mrn: string; line: string }>; bad: string[] } {
  const targets: Array<{ mrn: string; line: string }> = [];
  const bad: string[] = [];
  if (value == null) return { targets, bad };

  if (typeof value === "object") {
    const arr = Array.isArray(value) ? value : [value];
    for (const o of arr) {
      if (o && typeof o.stopId === "string" && typeof o.line === "string") {
        targets.push({ mrn: o.stopId.trim(), line: o.line.trim().toUpperCase() });
      } else {
        bad.push(JSON.stringify(o));
      }
    }
    return { targets, bad };
  }

  const raw = String(value).trim();
  if (!raw) return { targets, bad };
  for (const group of raw.split("/")) {
    const g = group.trim();
    if (!g) continue;
    const m = GROUP.exec(g);
    if (!m) {
      bad.push(g);
      continue;
    }
    const mrn = m[1];
    const lines = m[2]
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (lines.length === 0) {
      bad.push(g);
      continue;
    }
    for (const line of lines) targets.push({ mrn, line });
  }
  return { targets, bad };
}

function pickDisplayName(counts: Map<string, { name: string; n: number }>): { name: string; names: string[] } {
  const entries = [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const names = entries.map((e) => e.name);
  return { name: names.join(" / "), names };
}

export type BuildGraphOptions = {
  /** Mirror each asserted edge in the opposite direction. Physically true and closes 88 one-way gaps. */
  inferReciprocal?: boolean;
};

export function buildGraph(records?: EquipmentRecord[], options: BuildGraphOptions = {}): StationGraph {
  const { inferReciprocal = true } = options;
  const rows = records ?? loadEquipment().rows;
  const ada = rows.filter(isAdaElevator);

  const nodes = new Map<string, StationNode>();
  const elevators = new Map<string, EquipmentRecord>();
  const elevatorsByNode = new Map<string, EquipmentRecord[]>();
  const byMrn = new Map<string, string>();
  const byGtfsStop = new Map<string, string>();
  const byName = new Map<string, string>();
  const nameCounts = new Map<string, Map<string, { name: string; n: number }>>();

  for (const r of ada) {
    const id = String(r.stationcomplexid).trim();
    if (!id) continue;
    let node = nodes.get(id);
    if (!node) {
      node = { id, name: "", names: [], mrns: [], gtfsStopIds: [], lines: [], otherServices: [], elevators: [] };
      nodes.set(id, node);
      nameCounts.set(id, new Map());
      elevatorsByNode.set(id, []);
    }
    elevators.set(r.equipmentno, r);
    elevatorsByNode.get(id)!.push(r);
    node.elevators.push(r.equipmentno);

    const nc = nameCounts.get(id)!;
    const key = nameKey(r.station);
    const seen = nc.get(key);
    if (seen) seen.n += 1;
    else nc.set(key, { name: r.station.trim(), n: 1 });

    for (const mrn of splitList(r.elevatormrn)) {
      if (!node.mrns.includes(mrn)) node.mrns.push(mrn);
      if (!byMrn.has(mrn)) byMrn.set(mrn, id);
    }
    for (const stop of splitList(r.elevatorsgtfsstopid)) {
      if (!node.gtfsStopIds.includes(stop)) node.gtfsStopIds.push(stop);
      if (!byGtfsStop.has(stop)) byGtfsStop.set(stop, id);
    }
    for (const tok of splitList(r.linesservedbyelevator)) {
      const t = tok.toUpperCase();
      if (SUBWAY_LINES.has(t)) {
        if (!node.lines.includes(t)) node.lines.push(t);
      } else if (!node.otherServices.includes(t)) {
        node.otherServices.push(t);
      }
    }
  }

  for (const [id, node] of nodes) {
    const picked = pickDisplayName(nameCounts.get(id)!);
    node.name = picked.name;
    node.names = picked.names;
    node.lines.sort(lineSort);
    node.mrns.sort();
    node.gtfsStopIds.sort();
    node.elevators.sort();
    for (const n of node.names) if (!byName.has(nameKey(n))) byName.set(nameKey(n), id);
    if (!byName.has(nameKey(node.name))) byName.set(nameKey(node.name), id);
    if (!byMrn.has(id)) byMrn.set(id, id);
  }

  // ---- ride edges -------------------------------------------------------
  const unparsed: UnparsedEdge[] = [];
  const asserted = new Map<string, RideEdge>();
  const edgeKey = (e: { from: string; to: string; line: string; direction: Direction }) =>
    `${e.from}>${e.to}|${e.line}|${e.direction}`;

  for (const r of ada) {
    const from = String(r.stationcomplexid).trim();
    if (!nodes.has(from)) continue;
    for (const [field, direction] of [
      ["nextadanorth", "north"],
      ["nextadasouth", "south"],
    ] as Array<["nextadanorth" | "nextadasouth", Direction]>) {
      const { targets, bad } = parseNextAda(r[field]);
      for (const b of bad) {
        unparsed.push({ equipment: r.equipmentno, station: r.station, field, raw: b, reason: "malformed" });
      }
      for (const t of targets) {
        const to = byMrn.get(t.mrn) ?? byMrn.get(t.mrn.replace(/^0+/, "")) ?? byMrn.get(t.mrn.padStart(3, "0"));
        if (!to) {
          unparsed.push({
            equipment: r.equipmentno,
            station: r.station,
            field,
            raw: `${t.mrn}, ${t.line}`,
            reason: "unknown-target",
          });
          continue;
        }
        if (to === from) {
          unparsed.push({
            equipment: r.equipmentno,
            station: r.station,
            field,
            raw: `${t.mrn}, ${t.line}`,
            reason: "self-loop",
          });
          continue;
        }
        if (!SUBWAY_LINES.has(t.line)) {
          unparsed.push({
            equipment: r.equipmentno,
            station: r.station,
            field,
            raw: `${t.mrn}, ${t.line}`,
            reason: "unknown-line",
          });
          continue;
        }
        const e: RideEdge = { from, to, line: t.line, direction, inferred: false };
        asserted.set(edgeKey(e), e);
      }
    }
  }

  const all = new Map(asserted);
  if (inferReciprocal) {
    for (const e of asserted.values()) {
      const rev: RideEdge = {
        from: e.to,
        to: e.from,
        line: e.line,
        direction: e.direction === "north" ? "south" : "north",
        inferred: true,
      };
      const k = edgeKey(rev);
      if (!all.has(k)) all.set(k, rev);
    }
  }

  const rideEdges = [...all.values()].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.line.localeCompare(b.line) || a.direction.localeCompare(b.direction),
  );

  const adjacency = new Map<string, Map<string, RideEdge[]>>();
  for (const e of rideEdges) {
    let byLine = adjacency.get(e.from);
    if (!byLine) adjacency.set(e.from, (byLine = new Map()));
    const list = byLine.get(e.line);
    if (list) list.push(e);
    else byLine.set(e.line, [e]);
    // an edge proves the line runs through both ends even if no elevator row mentioned it
    for (const id of [e.from, e.to]) {
      const n = nodes.get(id);
      if (n && !n.lines.includes(e.line)) {
        n.lines.push(e.line);
        n.lines.sort(lineSort);
      }
    }
  }

  // ---- transfer edges ---------------------------------------------------
  const stopTransfers: StopTransferEdge[] = [];
  const lineTransfers: LineTransferEdge[] = [];
  for (const node of nodes.values()) {
    const stops = node.gtfsStopIds;
    for (const a of stops) for (const b of stops) if (a !== b) stopTransfers.push({ complex: node.id, fromStop: a, toStop: b });
    const lines = node.lines;
    for (const a of lines) for (const b of lines) if (a !== b) lineTransfers.push({ complex: node.id, fromLine: a, toLine: b });
  }

  const lineSet = new Set<string>();
  for (const n of nodes.values()) for (const l of n.lines) lineSet.add(l);

  const stats: GraphStats = {
    nodes: nodes.size,
    rideEdges: rideEdges.length,
    assertedRideEdges: asserted.size,
    inferredRideEdges: rideEdges.length - asserted.size,
    stopTransferEdges: stopTransfers.length,
    lineTransferEdges: lineTransfers.length,
    lines: lineSet.size,
    elevators: elevators.size,
    adaElevatorRows: ada.length,
    equipmentRows: rows.length,
    unparsed: unparsed.length,
  };

  return {
    nodes,
    rideEdges,
    stopTransfers,
    lineTransfers,
    adjacency,
    elevators,
    elevatorsByNode,
    byMrn,
    byGtfsStop,
    byName,
    unparsed,
    stats,
  };
}

function lineSort(a: string, b: string): number {
  const na = /^\d/.test(a);
  const nb = /^\d/.test(b);
  if (na !== nb) return na ? -1 : 1;
  return a.localeCompare(b);
}

let memo: StationGraph | null = null;
/** Process-wide singleton so the API routes do not re-parse 657 KB per request. */
export function getGraph(): StationGraph {
  if (!memo) memo = buildGraph();
  return memo;
}

/** Resolves a complex id, MRN, GTFS stop id, or station name to a node. */
export function resolveNode(graph: StationGraph, ref: string): StationNode | undefined {
  const s = String(ref ?? "").trim();
  if (!s) return undefined;
  const direct = graph.nodes.get(s);
  if (direct) return direct;
  const viaStop = graph.byGtfsStop.get(s) ?? graph.byGtfsStop.get(s.toUpperCase());
  if (viaStop) return graph.nodes.get(viaStop);
  const viaMrn = graph.byMrn.get(s);
  if (viaMrn) return graph.nodes.get(viaMrn);
  const viaName = graph.byName.get(nameKey(s));
  if (viaName) return graph.nodes.get(viaName);
  const k = nameKey(s);
  for (const [key, id] of graph.byName) if (key.startsWith(k) && k.length >= 4) return graph.nodes.get(id);
  return undefined;
}

export type StationListing = {
  id: string;
  name: string;
  gtfsStopIds: string[];
  lines: string[];
  elevatorCount: number;
};

export function listNodes(graph: StationGraph = getGraph()): StationListing[] {
  return [...graph.nodes.values()]
    .map((n) => ({
      id: n.id,
      name: n.name,
      gtfsStopIds: [...n.gtfsStopIds],
      lines: [...n.lines],
      elevatorCount: n.elevators.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

import { EquipmentRecord } from "./equipment";
import { Direction, StationGraph, SUBWAY_LINES } from "./graph";

export type Level = "street" | "mezzanine" | "platform" | "other";
export type ElevatorDirection = "north" | "south" | "both" | "unknown";
export type Segment =
  | "street-platform"
  | "street-mezzanine"
  | "mezzanine-platform"
  | "mezzanine-mezzanine"
  | "platform-platform"
  | "other";

export type ElevatorFacts = {
  code: string;
  station: string;
  complexId: string;
  serving: string;
  shortDescription: string;
  lines: string[];
  redundant: boolean;
  fromLevel: Level;
  toLevel: Level;
  segment: Segment;
  direction: ElevatorDirection;
};

/**
 * Direction words as they appear in `shortdescription` / `serving`, mapped to the
 * GTFS sense used by `nextadanorth` / `nextadasouth`.
 *
 * "Manhattan-bound" is deliberately absent: it means south from the Bronx and Queens
 * but north from Brooklyn, and the master's `borough` column is empty on every row,
 * so it cannot be resolved. Those elevators come back as `unknown` and are kept as
 * `role: "possible"` rather than dropped.
 */
const NORTH_WORDS = [
  "uptown", "northbound", "north-bound", "north bound", "bronx-bound", "bronx bound",
  "woodlawn", "wakefield", "pelham", "van cortlandt", "eastchester", "dyre", "riverdale",
  "inwood", "queens-bound", "queens bound", "jamaica-bound", "jamaica bound", "jamaica center",
  "flushing-bound", "flushing bound", "main st-bound", "forest hills", "astoria", "ditmars",
  "8 av-bound", "8 av bound", "harlem-bound", "norwood", "bedford park", "pelham bay",
];
const SOUTH_WORDS = [
  "downtown", "southbound", "south-bound", "south bound", "brooklyn-bound", "brooklyn bound",
  "canarsie", "coney island", "far rockaway", "rockaway", "bay ridge", "new lots", "flatbush",
  "brighton", "euclid", "lefferts", "ozone park", "church av-bound", "bay parkway",
  "south ferry", "world trade center-bound", "broad st",
];
const BOTH_WORDS = ["both directions", "in both directions", "all platforms", "platforms for"];

const STREET_WORDS = ["street", "sidewalk", "corner", "curb", "bus terminal", "outside", "entrance"];
const MEZZ_WORDS = [
  "mezzanine", "concourse", "passageway", "upper level", "lower level", "fare control",
  "oculus", "fulton center", "landing", "underpass", "subway", "overpass",
];
const PLATFORM_WORDS = ["platform", "-bound", " bound", "uptown", "downtown", "northbound", "southbound", "train"];

const LEVEL_RANK: Record<Level, number> = { street: 0, mezzanine: 1, platform: 2, other: 3 };

function has(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/** A bare route list on one side of "to" ("2/3", "uptown 6", "E/F") is a platform. */
const BARE_LINES = /(^|[\s(])[1-9A-Z](\s?[/,&]\s?[1-9A-Z])*\s*(platform|trains?)?\s*[.)]?$/;

function classifyLevel(part: string): Level {
  const t = part.toLowerCase();
  // platform is checked first: "Mezzanine to uptown 1" is a platform on the far side
  if (has(t, PLATFORM_WORDS)) return "platform";
  if (BARE_LINES.test(part.trim().toUpperCase())) return "platform";
  if (has(t, MEZZ_WORDS)) return "mezzanine";
  if (has(t, STREET_WORDS)) return "street";
  // "E 14 St and Avenue A (SW corner)" style addresses are street level
  if (/\b(av|ave|avenue|st|street|blvd|road|rd|pkwy|plaza)\b/.test(t) && /\band\b|&/.test(t)) return "street";
  return "other";
}

function classifyDirection(text: string): ElevatorDirection {
  const t = text.toLowerCase();
  if (has(t, BOTH_WORDS)) return "both";
  const n = has(t, NORTH_WORDS);
  const s = has(t, SOUTH_WORDS);
  if (n && s) return "both";
  if (n) return "north";
  if (s) return "south";
  return "unknown";
}

function segmentOf(a: Level, b: Level): Segment {
  const [lo, hi] = LEVEL_RANK[a] <= LEVEL_RANK[b] ? [a, b] : [b, a];
  if (lo === "street" && hi === "platform") return "street-platform";
  if (lo === "street" && hi === "mezzanine") return "street-mezzanine";
  if (lo === "mezzanine" && hi === "platform") return "mezzanine-platform";
  if (lo === "mezzanine" && hi === "mezzanine") return "mezzanine-mezzanine";
  if (lo === "platform" && hi === "platform") return "platform-platform";
  return "other";
}

/** Splits "X to Y [to Z]" and keeps the outer endpoints. */
function endpoints(text: string): [string, string] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(/\s+to\s+|-to-/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return [cleaned, cleaned];
  return [parts[0], parts[parts.length - 1]];
}

export function classifyElevator(r: EquipmentRecord): ElevatorFacts {
  const short = (r.shortdescription ?? "").trim();
  const serving = (r.serving ?? "").trim();
  const primary = /\sto\s/i.test(short) ? short : /\sto\s/i.test(serving) ? serving : short || serving;
  const [a, b] = endpoints(primary);
  const fromLevel = classifyLevel(a);
  const toLevel = classifyLevel(b);
  const lines = String(r.linesservedbyelevator ?? "")
    .split("/")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SUBWAY_LINES.has(s));
  return {
    code: r.equipmentno,
    station: r.station,
    complexId: String(r.stationcomplexid),
    serving,
    shortDescription: short,
    lines,
    redundant: Number(r.redundant) === 1,
    fromLevel,
    toLevel,
    segment: segmentOf(fromLevel, toLevel),
    direction: classifyDirection(`${short} ${serving}`),
  };
}

export type DependencyStage = "origin" | "transfer" | "destination";

export type ElevatorDependency = {
  code: string;
  station: string;
  atNode: string;
  atName: string;
  serving: string;
  shortDescription: string;
  line: string;
  direction: ElevatorDirection;
  legDirection: Direction;
  segment: Segment;
  stage: DependencyStage;
  /** "required": no alternative at this complex for this segment. "possible": alternative exists or the text is ambiguous. */
  role: "required" | "possible";
  redundant: boolean;
  why: string;
};

/** A leg with the graph direction that produced it. */
export type LegPlan = {
  line: string;
  fromStop: string;
  fromName: string;
  toStop: string;
  toName: string;
  stops: number;
  direction: Direction;
};

function servesLine(f: ElevatorFacts, line: string): boolean {
  return f.lines.length === 0 || f.lines.includes(line);
}

function directionOk(f: ElevatorFacts, want: Direction): boolean {
  return f.direction === want || f.direction === "both" || f.direction === "unknown";
}

/**
 * Recovers the direction of "Manhattan-bound" style elevators, which the text alone
 * cannot place (Manhattan is south of the Bronx and north of Brooklyn, and the
 * master's `borough` column is empty). If a complex has exactly one ambiguous
 * elevator and one explicitly-directed sibling on the same segment and lines, the
 * ambiguous one serves the opposite direction.
 */
export function resolveSiblingDirections(facts: ElevatorFacts[]): ElevatorFacts[] {
  const groups = new Map<string, ElevatorFacts[]>();
  for (const f of facts) {
    const key = `${f.segment}|${[...f.lines].sort().join("/")}`;
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  }
  for (const g of groups.values()) {
    if (g.length !== 2) continue;
    const known = g.find((f) => f.direction === "north" || f.direction === "south");
    const unknown = g.find((f) => f.direction === "unknown");
    if (!known || !unknown) continue;
    unknown.direction = known.direction === "north" ? "south" : "north";
  }
  return facts;
}

const factsCache = new WeakMap<StationGraph, Map<string, ElevatorFacts[]>>();

function nodeFacts(graph: StationGraph, nodeId: string): ElevatorFacts[] {
  let byNode = factsCache.get(graph);
  if (!byNode) factsCache.set(graph, (byNode = new Map()));
  const hit = byNode.get(nodeId);
  if (hit) return hit;
  const built = resolveSiblingDirections((graph.elevatorsByNode.get(nodeId) ?? []).map(classifyElevator));
  byNode.set(nodeId, built);
  return built;
}

/**
 * Picks the elevators one vertical move needs, at one complex, for one line/direction.
 * Group of one => required. Group of more than one => any of them will do, so all are "possible".
 */
function pick(
  cands: ElevatorFacts[],
  segments: Segment[],
  line: string,
  legDirection: Direction,
  stage: DependencyStage,
  graph: StationGraph,
  nodeId: string,
  why: (f: ElevatorFacts) => string,
): ElevatorDependency[] {
  const name = graph.nodes.get(nodeId)?.name ?? nodeId;
  const out: ElevatorDependency[] = [];
  const groups = new Map<Segment, ElevatorFacts[]>();
  for (const f of cands) {
    if (!segments.includes(f.segment)) continue;
    const g = groups.get(f.segment);
    if (g) g.push(f);
    else groups.set(f.segment, [f]);
  }
  // A direct street-platform elevator makes the street-mezzanine + mezzanine-platform
  // chain optional (and vice versa), so nothing in either path is strictly required.
  const hasDirect = (groups.get("street-platform")?.length ?? 0) > 0;
  const hasChain = (groups.get("street-mezzanine")?.length ?? 0) > 0 || (groups.get("mezzanine-platform")?.length ?? 0) > 0;
  const twoPaths = hasDirect && hasChain;

  for (const [seg, list] of groups) {
    const alternatives = list.length > 1 || twoPaths;
    for (const f of list) {
      out.push({
        code: f.code,
        station: f.station,
        atNode: nodeId,
        atName: name,
        serving: f.serving || f.shortDescription,
        shortDescription: f.shortDescription,
        line,
        direction: f.direction,
        legDirection,
        segment: seg,
        stage,
        role: alternatives || f.direction === "unknown" ? "possible" : "required",
        redundant: f.redundant,
        why: why(f),
      });
    }
  }
  return out;
}

/**
 * Every elevator a route leans on: street to platform at the origin, platform to
 * mezzanine to platform at each transfer, platform to street at the destination.
 */
export function routeElevators(legs: LegPlan[], graph: StationGraph): ElevatorDependency[] {
  if (legs.length === 0) return [];
  const deps: ElevatorDependency[] = [];

  const first = legs[0];
  deps.push(
    ...pick(
      nodeFacts(graph, first.fromStop).filter((f) => servesLine(f, first.line) && directionOk(f, first.direction)),
      ["street-platform", "street-mezzanine", "mezzanine-platform"],
      first.line,
      first.direction,
      "origin",
      graph,
      first.fromStop,
      (f) => `boarding the ${first.line} ${first.direction}bound at ${first.fromName}: ${f.shortDescription || f.serving}`,
    ),
  );

  for (let i = 0; i + 1 < legs.length; i++) {
    const arrive = legs[i];
    const depart = legs[i + 1];
    const at = arrive.toStop;
    const facts = nodeFacts(graph, at);
    deps.push(
      ...pick(
        facts.filter((f) => servesLine(f, arrive.line) && directionOk(f, arrive.direction)),
        ["mezzanine-platform", "street-platform"],
        arrive.line,
        arrive.direction,
        "transfer",
        graph,
        at,
        (f) => `leaving the ${arrive.line} platform at ${arrive.toName}: ${f.shortDescription || f.serving}`,
      ),
      ...pick(
        facts.filter((f) => f.segment === "mezzanine-mezzanine" || f.segment === "platform-platform"),
        ["mezzanine-mezzanine", "platform-platform"],
        depart.line,
        depart.direction,
        "transfer",
        graph,
        at,
        (f) => `crossing mezzanines at ${arrive.toName}: ${f.shortDescription || f.serving}`,
      ),
      ...pick(
        facts.filter((f) => servesLine(f, depart.line) && directionOk(f, depart.direction)),
        ["mezzanine-platform", "street-platform"],
        depart.line,
        depart.direction,
        "transfer",
        graph,
        at,
        (f) => `reaching the ${depart.line} ${depart.direction}bound platform at ${arrive.toName}: ${f.shortDescription || f.serving}`,
      ),
    );
  }

  const last = legs[legs.length - 1];
  deps.push(
    ...pick(
      nodeFacts(graph, last.toStop).filter((f) => servesLine(f, last.line) && directionOk(f, last.direction)),
      ["street-platform", "street-mezzanine", "mezzanine-platform"],
      last.line,
      last.direction,
      "destination",
      graph,
      last.toStop,
      (f) => `exiting to the street at ${last.toName}: ${f.shortDescription || f.serving}`,
    ),
  );

  const seen = new Map<string, ElevatorDependency>();
  for (const d of deps) {
    const key = `${d.code}|${d.stage}|${d.atNode}`;
    const prior = seen.get(key);
    if (!prior || (prior.role === "possible" && d.role === "required")) seen.set(key, d);
  }
  return [...seen.values()].sort(
    (a, b) => stageRank(a.stage) - stageRank(b.stage) || a.atNode.localeCompare(b.atNode) || a.code.localeCompare(b.code),
  );
}

function stageRank(s: DependencyStage): number {
  return s === "origin" ? 0 : s === "transfer" ? 1 : 2;
}

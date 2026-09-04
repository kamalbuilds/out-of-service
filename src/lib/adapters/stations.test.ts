/**
 * The home page's station-filter input (`StationPicker`) filters the real station list against
 * whatever a person types, via `stationMatchesQuery`. A production incident reported an
 * `Uncaught` exception while typing into that input; the inline predicate it used to run
 * (`s.name.toLowerCase().includes(q) || s.lines.some((l) => l.toLowerCase() === q)`) throws
 * `TypeError: ... .toLowerCase is not a function` the moment any station record has a
 * non-string `name` or a `lines` array containing a non-string entry, and throws again if
 * `lines` itself is missing or not an array (`.some` is not a function on `undefined`). The real
 * `listStations()` output is clean today (asserted by the second test below), but nothing at the
 * type level stops a future build of the index from emitting a bad row, and a single bad row
 * should not take down the filter for every other station. These tests reproduce the exact
 * malformed shapes and assert the guarded function returns `false` instead of throwing.
 */
import { describe, expect, it } from "vitest";
import { stationMatchesQuery, listStations, resolveStationOrAmbiguous } from "./stations";
import type { StationSummary } from "@/lib/types";

const BASE: StationSummary = {
  id: "1",
  name: "Jay St-MetroTech",
  displayName: "Jay St-MetroTech",
  gtfsStopIds: ["A41"],
  lines: ["A", "C", "F", "R"],
  elevatorCount: 4,
  worstTier: "unreliable",
  ada: true,
};

describe("stationMatchesQuery", () => {
  it("matches on a substring of the name, case-insensitively", () => {
    expect(stationMatchesQuery(BASE, "jay st")).toBe(true);
    expect(stationMatchesQuery(BASE, "metrotech")).toBe(true);
    expect(stationMatchesQuery(BASE, "union sq")).toBe(false);
  });

  it("matches on an exact line letter, case-insensitively", () => {
    expect(stationMatchesQuery(BASE, "a")).toBe(true);
    expect(stationMatchesQuery(BASE, "r")).toBe(true);
    expect(stationMatchesQuery(BASE, "z")).toBe(false);
  });

  it("an empty or whitespace-only query matches every station", () => {
    expect(stationMatchesQuery(BASE, "")).toBe(true);
    expect(stationMatchesQuery(BASE, "   ")).toBe(true);
  });

  it("does not throw and returns false when `name` is not a string", () => {
    const bad = { ...BASE, name: undefined } as unknown as StationSummary;
    expect(() => stationMatchesQuery(bad, "jay")).not.toThrow();
    expect(stationMatchesQuery(bad, "jay")).toBe(false);
  });

  it("does not throw and returns false when `lines` is missing or not an array", () => {
    // "f" is a line on BASE but not a substring of "Jay St-MetroTech", so this only passes
    // through the `lines` branch — exactly the branch that throws without the guard.
    const missing = { ...BASE, lines: undefined } as unknown as StationSummary;
    const notArray = { ...BASE, lines: "A/C/F/R" } as unknown as StationSummary;
    expect(() => stationMatchesQuery(missing, "f")).not.toThrow();
    expect(() => stationMatchesQuery(notArray, "f")).not.toThrow();
    expect(stationMatchesQuery(missing, "f")).toBe(false);
    expect(stationMatchesQuery(notArray, "f")).toBe(false);
  });

  it("does not throw when `lines` contains a non-string entry, and still matches the rest", () => {
    const bad = { ...BASE, lines: ["A", null, 6, "R"] } as unknown as StationSummary;
    expect(() => stationMatchesQuery(bad, "r")).not.toThrow();
    expect(stationMatchesQuery(bad, "r")).toBe(true);
    expect(stationMatchesQuery(bad, "6")).toBe(false); // the numeric 6, not the string "6"
  });

  it("the real listStations() output has no malformed rows (documents the current, clean baseline)", () => {
    const stations = listStations();
    expect(stations.length).toBeGreaterThan(0);
    for (const s of stations) {
      expect(typeof s.name).toBe("string");
      expect(Array.isArray(s.lines)).toBe(true);
      for (const l of s.lines) expect(typeof l).toBe("string");
    }
  });
});

/**
 * `POST /api/trip {"from":"Times Sq-42 St","to":"34 St-Penn Station"}` used to silently
 * resolve "34 St-Penn Station" to whichever of its two real complexes `resolveStation`'s
 * `.find()` chain hit first, so the same request produced different scored routes on
 * different runs (complex 164, A C E, vs complex 318, 1 2 3 LIRR). These tests are the
 * check that must be able to fail: the bare, ambiguous name asserts NO id comes back at
 * all, only a structured candidate list, which would fail immediately if the resolver
 * regressed to picking one silently.
 */
describe("resolveStationOrAmbiguous", () => {
  it("a bare name shared by two complexes returns an ambiguity with both candidates, no id", () => {
    const result = resolveStationOrAmbiguous("34 St-Penn Station");
    expect(result).not.toBeNull();
    expect(result && "ambiguous" in result).toBe(true);
    if (!result || !("ambiguous" in result)) throw new Error("expected an ambiguous result");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.id).sort()).toEqual(["164", "318"]);
    // The check that can fail: an ambiguous result must never carry a resolved id.
    expect((result as unknown as { id?: string }).id).toBeUndefined();
  });

  it("the name qualified with its lines resolves uniquely to the A C E complex", () => {
    const result = resolveStationOrAmbiguous("34 St-Penn Station (A C E)");
    expect(result && !("ambiguous" in result) ? result.id : null).toBe("164");
  });

  it("an exact complex id resolves uniquely, bypassing the name entirely", () => {
    const result = resolveStationOrAmbiguous("318");
    expect(result && !("ambiguous" in result) ? result.id : null).toBe("318");
  });

  it("a station name that is not shared by any other complex resolves to its own id", () => {
    const result = resolveStationOrAmbiguous("Court Sq");
    expect(result && !("ambiguous" in result) ? result.id : null).toBe("606");
  });
});

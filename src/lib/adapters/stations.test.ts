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
import { stationMatchesQuery, listStations } from "./stations";
import type { StationSummary } from "@/lib/types";

const BASE: StationSummary = {
  id: "1",
  name: "Jay St-MetroTech",
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

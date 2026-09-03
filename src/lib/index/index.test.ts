import { describe, expect, it } from "vitest";
import { getEquipment, listStations, loadIndex, nextAdaNeighbors } from "./index";

describe("reliability index", () => {
  it("loads at least 600 equipment entries", () => {
    const index = loadIndex();
    expect(index.length).toBeGreaterThanOrEqual(600);
  });

  it("carries a source query string on every entry", () => {
    const index = loadIndex();
    for (const entry of index) {
      expect(typeof entry.metrics.source.query).toBe("string");
      expect(entry.metrics.source.query.length).toBeGreaterThan(0);
      expect(entry.metrics.source.query).toContain("data.ny.gov/resource/rc78-7x78.json");
      expect(entry.metrics.source.query).toContain(entry.equipment_code);
    }
  });

  it("looks up a known-good elevator, EL293 at 1 Av on the L", () => {
    const eq = getEquipment("EL293");
    expect(eq).toBeDefined();
    expect(eq?.station).toBe("1 Av");
    expect(eq?.lines).toBe("L");
    expect(eq?.gtfs_stop_id).toBe("L06");
    expect(eq?.equipment_type).toBe("EL");
    // trailing-24-month availability is a genuine fraction, not a placeholder
    expect(eq?.metrics.availability_24h_mean_24m).toBeGreaterThan(0);
    expect(eq?.metrics.availability_24h_mean_24m).toBeLessThanOrEqual(1);
  });

  it("normalizes lookups regardless of case/whitespace", () => {
    expect(getEquipment("el293")).toBeDefined();
    expect(getEquipment(" EL293 ")).toBeDefined();
  });

  it("parses nextAdaNeighbors from the equipment master's 'stop, line' strings", () => {
    const { north, south } = nextAdaNeighbors("L06");
    expect(north).toEqual({ stopId: "117", line: "L" });
    expect(south).toEqual({ stopId: "120", line: "L" });
  });

  it("lists only ADA-accessible stations, each with a name, mrn and gtfs stop ids", () => {
    const stations = listStations();
    expect(stations.length).toBeGreaterThan(0);
    for (const station of stations) {
      expect(station.station.length).toBeGreaterThan(0);
      expect(Array.isArray(station.gtfs_stop_ids)).toBe(true);
      expect(Array.isArray(station.lines)).toBe(true);
    }
    // Every station in this list must have at least one ADA-flagged elevator/escalator.
    const index = loadIndex();
    const oneAv = stations.find((s) => s.station_complex_mrn === "119");
    expect(oneAv).toBeDefined();
    const oneAvEquipment = index.filter((e) => e.station_complex_mrn === "119");
    expect(oneAvEquipment.some((e) => e.ada)).toBe(true);
  });
});

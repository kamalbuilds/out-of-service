import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fixture from "./__fixtures__/nyct_ene.sample.json";
import {
  fetchLiveOutages,
  parseNyDateToIso,
  normaliseEquipmentCode,
  __resetLiveOutagesCacheForTests,
} from "./mta";
import { joinLiveWithMaster } from "./join";

describe("parseNyDateToIso", () => {
  it("converts an EDT (summer, UTC-4) wall-clock time correctly", () => {
    // Record 0 of the fixture: 09/14/2026 10:00:00 PM America/New_York.
    expect(parseNyDateToIso("09/14/2026 10:00:00 PM")).toBe(
      "2026-09-15T02:00:00.000Z",
    );
  });

  it("converts a second EDT record (early morning) correctly", () => {
    // Record 1 of the fixture: 09/14/2026 02:00:00 AM America/New_York.
    expect(parseNyDateToIso("09/14/2026 02:00:00 AM")).toBe(
      "2026-09-14T06:00:00.000Z",
    );
  });

  it("converts an EST (winter, UTC-5) wall-clock time correctly", () => {
    expect(parseNyDateToIso("01/14/2026 05:00:00 PM")).toBe(
      "2026-01-14T22:00:00.000Z",
    );
  });

  it("returns null for garbage input", () => {
    expect(parseNyDateToIso("")).toBeNull();
    expect(parseNyDateToIso("not a date")).toBeNull();
  });
});

describe("normaliseEquipmentCode", () => {
  it("trims, uppercases, and removes internal spaces", () => {
    expect(normaliseEquipmentCode(" el 131 ")).toBe("EL131");
    expect(normaliseEquipmentCode("EL 131")).toBe("EL131");
    expect(normaliseEquipmentCode("el131")).toBe("EL131");
  });
});

describe("fetchLiveOutages", () => {
  beforeEach(() => {
    __resetLiveOutagesCacheForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => fixture,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalises an equipment id containing a space", async () => {
    const spaced = [
      {
        ...fixture[0],
        equipment: "EL 131",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => spaced,
      })),
    );
    const { outages } = await fetchLiveOutages();
    expect(outages).toHaveLength(1);
    expect(outages[0].equipmentCode).toBe("EL131");
  });

  it("counts EL vs ES records matching the known fixture totals (58 EL, 25 ES, 83 total)", async () => {
    const { outages, sourceUrl, fetchedAt, stale } = await fetchLiveOutages();
    expect(outages).toHaveLength(83);
    expect(outages.filter((o) => o.equipmentType === "EL")).toHaveLength(58);
    expect(outages.filter((o) => o.equipmentType === "ES")).toHaveLength(25);
    expect(sourceUrl).toContain("nyct_ene.json");
    expect(stale).toBe(false);
    expect(() => new Date(fetchedAt).toISOString()).not.toThrow();
  });

  it("marks isUpcoming/isCurrent consistently with the feed's own flag", async () => {
    const { outages } = await fetchLiveOutages();
    for (const o of outages) {
      if (o.isUpcoming) {
        expect(o.isCurrent).toBe(false);
      }
    }
  });

  it("serves cached data with stale:true once the TTL expires and refresh fails", async () => {
    vi.useFakeTimers();
    try {
      // First call populates the cache with 83 fresh records.
      const first = await fetchLiveOutages();
      expect(first.stale).toBe(false);
      expect(first.outages).toHaveLength(83);

      // Advance past the 60s cache TTL, then make the next fetch fail.
      vi.advanceTimersByTime(61_000);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("network down");
        }),
      );

      const second = await fetchLiveOutages();
      expect(second.stale).toBe(true);
      // The cached payload is still served, not an empty/thrown result.
      expect(second.outages).toHaveLength(83);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws (does not fabricate data) when the first fetch ever attempted fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(fetchLiveOutages()).rejects.toThrow();
  });
});

describe("joinLiveWithMaster", () => {
  it("computes coverage as matched/total and flags unmatched records", () => {
    const outages = [
      { equipmentCode: "EL131" } as never,
      { equipmentCode: "EL999" } as never,
    ];
    const master = [
      { equipmentno: "EL131", station: "Test", elevatorsgtfsstopid: "S01", stationcomplexid: "1", redundant: 0, nextadanorth: null, nextadasouth: null },
    ];
    const result = joinLiveWithMaster(outages, master);
    expect(result.totalCount).toBe(2);
    expect(result.matchedCount).toBe(1);
    expect(result.coverage).toBe(0.5);
    expect(result.outages[0].matched).toBe(true);
    expect(result.outages[0].gtfsStopId).toBe("S01");
    expect(result.outages[1].matched).toBe(false);
    expect(result.outages[1].gtfsStopId).toBeNull();
  });

  it("returns coverage 0 for an empty outage list rather than dividing by zero", () => {
    const result = joinLiveWithMaster([], []);
    expect(result.coverage).toBe(0);
    expect(result.totalCount).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { MOUNTAIN_STONES, createMountain } from "./mountain";
import { migrateLegacyGrid, parseSaveValue, serializeSave } from "./persist";
import { minedMountain } from "./test-fixtures";

const covered = { kind: "covered" };
const legacyGrid = (kinds: readonly string[]) => ({
  width: 3,
  height: 3,
  cells: [
    ...kinds.map((kind) => ({ kind })),
    ...Array.from({ length: 9 - kinds.length }, () => covered),
  ],
});

describe("serializeSave and parseSaveValue", () => {
  it("round-trips a v4 mountain save", () => {
    const mountain = { ...minedMountain(42), helpers: 3 };
    const saved = serializeSave({ mountain, lastSeen: 1234 });
    expect(saved).toEqual({ version: 4, mountain, lastSeen: 1234 });
    expect(parseSaveValue(JSON.parse(JSON.stringify(saved)))).toEqual({
      mountain,
      lastSeen: 1234,
    });
  });

  it("scales a v3 (1M) save into the 100M mountain at the same place", () => {
    expect(
      parseSaveValue({
        version: 3,
        mountain: { remaining: 980_000, pocket: 77, helpers: 4 },
        lastSeen: 5,
      }),
    ).toEqual({
      mountain: {
        remaining: 98_000_000,
        pocket: 77,
        helpers: 4,
        carts: 0,
        drills: 0,
        borers: 0,
      },
      lastSeen: 5,
    });
    expect(
      parseSaveValue({
        version: 3,
        mountain: { remaining: 0, pocket: 0, helpers: 0 },
        lastSeen: 5,
      })?.mountain.remaining,
    ).toBe(0);
    expect(
      parseSaveValue({
        version: 3,
        mountain: { remaining: 1_000_001, pocket: 0, helpers: 0 },
        lastSeen: 5,
      }),
    ).toBeUndefined();
  });

  it("reads a save without carts as zero carts and rejects bad carts", () => {
    const base = { remaining: 5, pocket: 1, helpers: 2 };
    expect(
      parseSaveValue({ version: 4, mountain: base, lastSeen: 1 })?.mountain,
    ).toEqual({ ...base, carts: 0, drills: 0, borers: 0 });
    expect(
      parseSaveValue({
        version: 4,
        mountain: { ...base, carts: 1, drills: 2 },
        lastSeen: 1,
      })?.mountain,
    ).toEqual({ ...base, carts: 1, drills: 2, borers: 0 });
    expect(
      parseSaveValue({
        version: 4,
        mountain: { ...base, borers: 7 },
        lastSeen: 1,
      })?.mountain.borers,
    ).toBe(7);
    for (const borers of [-1, 1.5, "3", null]) {
      expect(
        parseSaveValue({
          version: 4,
          mountain: { ...base, borers },
          lastSeen: 1,
        }),
      ).toBeUndefined();
    }
    for (const drills of [-1, 1.5, "3", null]) {
      expect(
        parseSaveValue({
          version: 4,
          mountain: { ...base, drills },
          lastSeen: 1,
        }),
      ).toBeUndefined();
    }
    for (const carts of [-1, 1.5, "3", null]) {
      expect(
        parseSaveValue({
          version: 4,
          mountain: { ...base, carts },
          lastSeen: 1,
        }),
      ).toBeUndefined();
    }
  });

  it("migrates a v2 grid save and keeps its timestamp", () => {
    expect(
      parseSaveValue({
        version: 2,
        grid: legacyGrid(["dug", "stone", "chunk", "dug"]),
        lastSeen: 99,
      }),
    ).toEqual({
      mountain: {
        remaining: MOUNTAIN_STONES - 4,
        pocket: 3,
        helpers: 0,
        carts: 0,
        drills: 0,
        borers: 0,
      },
      lastSeen: 99,
    });
  });

  it("migrates a v1 grid save without a timestamp", () => {
    expect(parseSaveValue({ version: 1, grid: legacyGrid([]) })).toEqual({
      mountain: createMountain(),
      lastSeen: undefined,
    });
  });

  it("rejects missing fields, unknown versions, and bad shapes", () => {
    for (const bad of [
      null,
      { version: 3 },
      { version: 3, mountain: createMountain() },
      {
        version: 3,
        mountain: { remaining: -1, pocket: 0, helpers: 0 },
        lastSeen: 1,
      },
      { version: 2, grid: legacyGrid([]) },
      { version: 2, grid: { width: 2, height: 2, cells: [] }, lastSeen: 1 },
      { version: 5, mountain: createMountain(), lastSeen: 1 },
    ]) {
      expect(parseSaveValue(bad)).toBeUndefined();
    }
  });
});

describe("migrateLegacyGrid", () => {
  it("counts every uncovered cell as mined and pays 1 per stone, 2 per chunk", () => {
    expect(
      migrateLegacyGrid(legacyGrid(Array.from({ length: 9 }, () => "chunk"))),
    ).toEqual({
      remaining: MOUNTAIN_STONES - 9,
      pocket: 18,
      helpers: 0,
      carts: 0,
      drills: 0,
      borers: 0,
    });
  });

  it("rejects unknown cell kinds, including prototype keys", () => {
    expect(migrateLegacyGrid(legacyGrid(["gold"]))).toBeUndefined();
    expect(migrateLegacyGrid(legacyGrid(["toString"]))).toBeUndefined();
    expect(
      migrateLegacyGrid(legacyGrid([1 as unknown as string])),
    ).toBeUndefined();
  });
});

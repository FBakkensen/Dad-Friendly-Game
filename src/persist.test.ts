import { describe, expect, it } from "vitest";
import type { Engineer } from "./engineers";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { migrateLegacyGrid, parseSaveValue, serializeSave } from "./persist";
import { minedMountain, unstaffedSave } from "./test-fixtures";

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
  it("round-trip every save field (a new field must be serialized, #130)", () => {
    // Required<Mountain>: adding a field is a type error here until it's set.
    const everyField: Required<Mountain> = {
      remaining: 5,
      pocket: 6,
      helpers: 7,
      carts: 1,
      drills: 1,
      borers: 1,
      machines: 1,
      kids: 1,
      upgrades: { tap: 1 },
      boosts: { sharper: 9 },
      startedAt: 3,
      staffed: 2,
      legacy: 2,
      engineers: [
        { name: "Ada", rank: 1, trips: 3, post: "tunnel" },
      ] satisfies Engineer[],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "old-shaft",
          sentAt: 10,
          returnsAt: 10 + 60 * 60_000,
          home: "borer",
          find: { kind: "keepsake", id: "whistle" },
        },
      ],
      finds: ["pick", "drawing"],
    };
    expect(
      parseSaveValue(serializeSave({ mountain: everyField, lastSeen: 1 })),
    ).toEqual({ mountain: everyField, lastSeen: 1 });
  });

  it("round-trips engineers and leaves them out of an older save", () => {
    const engineers = [
      {
        name: "Nils" as const,
        rank: 1 as const,
        trips: 3,
        post: "drill" as const,
      },
    ];
    const mountain = { ...minedMountain(4), engineers };
    const saved = serializeSave({ mountain, lastSeen: 8 });
    expect(saved.mountain.engineers).toEqual(engineers);
    expect(parseSaveValue(JSON.parse(JSON.stringify(saved)))?.mountain).toEqual(
      mountain,
    );
    const older = minedMountain(4);
    expect(
      parseSaveValue({ version: 5, mountain: older, lastSeen: 8 })?.mountain,
    ).toEqual(older);
    expect("engineers" in older).toBe(false);
  });

  it("round-trips expeditions and finds, and an older save is unchanged", () => {
    const mountain = {
      ...minedMountain(4),
      engineers: [
        {
          name: "Ada" as const,
          rank: 0 as const,
          trips: 0,
          post: "tunnel" as const,
        },
      ],
      expeditions: [
        {
          engineer: "Ada" as const,
          tunnel: "side-seam" as const,
          sentAt: 4,
          returnsAt: 4 + 10 * 60_000,
          home: "camp" as const,
          find: { kind: "glimmer" as const, id: "lantern" as const },
        },
      ],
      finds: ["boots" as const, "ribbon" as const],
    };
    const saved = serializeSave({ mountain, lastSeen: 4 });
    expect(parseSaveValue(JSON.parse(JSON.stringify(saved)))?.mountain).toEqual(
      mountain,
    );
    const older = minedMountain(4);
    expect(
      parseSaveValue({ version: 5, mountain: older, lastSeen: 4 })?.mountain,
    ).toEqual(older);
    expect("expeditions" in older).toBe(false);
    expect("finds" in older).toBe(false);
  });

  it("round-trips a v4 mountain save", () => {
    const mountain = { ...minedMountain(42), helpers: 3 };
    const saved = serializeSave({ mountain, lastSeen: 1234 });
    expect(saved).toEqual({ version: 5, mountain, lastSeen: 1234 });
    expect(parseSaveValue(JSON.parse(JSON.stringify(saved)))).toEqual({
      mountain,
      lastSeen: 1234,
    });
  });

  it("round-trips upgrades, and leaves them out when there are none", () => {
    const mountain = { ...minedMountain(42), upgrades: { tap: 4 } };
    const saved = serializeSave({ mountain, lastSeen: 1 });
    expect(saved.mountain.upgrades).toEqual({ tap: 4 });
    expect(parseSaveValue(JSON.parse(JSON.stringify(saved)))?.mountain).toEqual(
      mountain,
    );
    const none = serializeSave({
      mountain: { ...minedMountain(42), upgrades: {} },
      lastSeen: 1,
    });
    expect("upgrades" in none.mountain).toBe(false);
  });

  it("round-trips running boosts so a reload keeps the countdown", () => {
    const mountain = { ...minedMountain(42), boosts: { overtime: 123_456 } };
    const saved = serializeSave({ mountain, lastSeen: 1 });
    expect(parseSaveValue(JSON.parse(JSON.stringify(saved)))?.mountain).toEqual(
      mountain,
    );
    expect(
      parseSaveValue({
        version: 5,
        mountain: { ...minedMountain(1), boosts: { turbo: 1 } },
        lastSeen: 1,
      }),
    ).toBeUndefined();
  });

  it("keeps a v4 dad's mined stones and adds the depth under the old bottom", () => {
    expect(
      parseSaveValue({
        version: 4,
        mountain: { remaining: 40_000_000, pocket: 3, helpers: 1 },
        lastSeen: 9,
      })?.mountain.remaining,
    ).toBe(180_000_000);
    expect(
      parseSaveValue({
        version: 4,
        mountain: { remaining: -1, pocket: 0, helpers: 0 },
        lastSeen: 1,
      }),
    ).toBeUndefined();
  });

  it("scales a v3 (1M) save onto the v4 place, then the deeper bottom", () => {
    expect(
      parseSaveValue({
        version: 3,
        mountain: { remaining: 980_000, pocket: 77, helpers: 4 },
        lastSeen: 5,
      }),
    ).toEqual({
      mountain: {
        remaining: 238_000_000,
        pocket: 77,
        helpers: 4,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
      lastSeen: 5,
    });
    expect(
      parseSaveValue({
        version: 3,
        mountain: { remaining: 0, pocket: 0, helpers: 0 },
        lastSeen: 5,
      })?.mountain.remaining,
    ).toBe(140_000_000);
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
      parseSaveValue({ version: 5, mountain: base, lastSeen: 1 })?.mountain,
    ).toEqual({
      ...base,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    });
    expect(
      parseSaveValue({
        version: 5,
        mountain: { ...base, carts: 1, drills: 2 },
        lastSeen: 1,
      })?.mountain,
    ).toEqual({
      ...base,
      carts: 1,
      drills: 2,
      borers: 0,
      machines: 0,
      kids: 0,
    });
    expect(
      parseSaveValue({
        version: 5,
        mountain: { ...base, borers: 7 },
        lastSeen: 1,
      })?.mountain.borers,
    ).toBe(7);
    expect(
      parseSaveValue({
        version: 5,
        mountain: { ...base, machines: 3 },
        lastSeen: 1,
      })?.mountain.machines,
    ).toBe(3);
    expect(
      parseSaveValue({
        version: 5,
        mountain: { ...base, machines: -1 },
        lastSeen: 1,
      }),
    ).toBeUndefined();
    expect(
      parseSaveValue({
        version: 5,
        mountain: { ...base, upgrades: { tap: 2 } },
        lastSeen: 1,
      })?.mountain.upgrades,
    ).toEqual({ tap: 2 });
    expect(
      parseSaveValue({
        version: 5,
        mountain: { ...base, upgrades: { tap: 99 } },
        lastSeen: 1,
      }),
    ).toBeUndefined();
    for (const borers of [-1, 1.5, "3", null]) {
      expect(
        parseSaveValue({
          version: 5,
          mountain: { ...base, borers },
          lastSeen: 1,
        }),
      ).toBeUndefined();
    }
    for (const drills of [-1, 1.5, "3", null]) {
      expect(
        parseSaveValue({
          version: 5,
          mountain: { ...base, drills },
          lastSeen: 1,
        }),
      ).toBeUndefined();
    }
    for (const carts of [-1, 1.5, "3", null]) {
      expect(
        parseSaveValue({
          version: 5,
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
        machines: 0,
        kids: 0,
        staffed: 2,
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
      { version: 6, mountain: createMountain(), lastSeen: 1 },
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
      machines: 0,
      kids: 0,
      staffed: 2,
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

describe("the staffing mark", () => {
  it("round-trips 2, and still accepts true and 1 from older clients", () => {
    const mountain = minedMountain(3);
    expect(mountain.staffed).toBe(2);
    const saved = serializeSave({ mountain, lastSeen: 1 });
    expect(parseSaveValue(JSON.parse(JSON.stringify(saved)))?.mountain).toEqual(
      mountain,
    );
    const old = unstaffedSave(mountain);
    expect(
      parseSaveValue({ version: 5, mountain: old, lastSeen: 1 })?.mountain,
    ).toEqual(old);
    for (const staffed of [true, 1] as const) {
      expect(
        parseSaveValue({
          version: 5,
          mountain: { ...old, staffed },
          lastSeen: 1,
        })?.mountain.staffed,
      ).toBe(staffed);
    }
    for (const staffed of [false, 0, 3, "2"]) {
      expect(
        parseSaveValue({
          version: 5,
          mountain: { ...old, staffed },
          lastSeen: 1,
        }),
      ).toBeUndefined();
    }
  });
});

describe("kid helpers in the save (#102)", () => {
  it("round-trip, and a save from before kids reads zero", () => {
    const mountain = { ...createMountain(), kids: 9 };
    const saved = serializeSave({ mountain, lastSeen: 3 });
    expect(saved.mountain.kids).toBe(9);
    expect(parseSaveValue(saved)?.mountain.kids).toBe(9);
    const old = Object.fromEntries(
      Object.entries(saved.mountain).filter(([key]) => key !== "kids"),
    );
    expect(parseSaveValue({ ...saved, mountain: old })?.mountain.kids).toBe(0);
    expect(
      parseSaveValue({ ...saved, mountain: { ...old, kids: -2 } }),
    ).toBeUndefined();
  });
});

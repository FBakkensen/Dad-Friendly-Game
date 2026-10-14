import { describe, expect, it } from "vitest";
import type { Engineer } from "./engineers";
import { materialsFromMined } from "./layers";
import {
  minedOut,
  MOUNTAIN_STONES,
  createMountain,
  type Mountain,
} from "./mountain";
import { migrateLegacyGrid, parseSaveValue, serializeSave } from "./persist";
import { recipesForMined, STARTING_RECIPE_IDS } from "./workshop";
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
      materials: { clay: 1, iron: 0, crystal: 0, heartstone: 0 },
      bench: {
        recipe: "iron-rails",
        startedAt: 5,
        endsAt: 5 + 60_000,
      },
      crafted: { "blasting-charge": 2 },
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "crystal-lamp",
      ],
      chargeUntil: 80_000,
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
    expect(saved.version).toBe(6);
    expect(saved.lastSeen).toBe(1234);
    expect(saved.workshop.materials).toEqual(mountain.materials);
    expect(saved.workshop.recipes).toEqual(mountain.recipes);
    expect(saved.mountain).not.toHaveProperty("materials");
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
        materials: materialsFromMined(2_000_000),
        recipes: recipesForMined(2_000_000),
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
      materials: materialsFromMined(MOUNTAIN_STONES - base.remaining),
      recipes: recipesForMined(MOUNTAIN_STONES - base.remaining),
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
      materials: materialsFromMined(MOUNTAIN_STONES - base.remaining),
      recipes: recipesForMined(MOUNTAIN_STONES - base.remaining),
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
        materials: materialsFromMined(4),
        recipes: recipesForMined(4),
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
      { version: 7, mountain: createMountain(), lastSeen: 1 },
      {
        version: 6,
        mountain: { remaining: MOUNTAIN_STONES, pocket: 0, helpers: 0 },
        lastSeen: 1,
      },
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
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 9,
      pocket: 18,
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

describe("v6 materials back-grant (#195)", () => {
  const dug = (stones: number): Mountain => ({
    remaining: MOUNTAIN_STONES - stones,
    pocket: stones,
    helpers: 1,
    carts: 0,
    drills: 0,
    borers: 0,
    machines: 0,
    kids: 0,
  });

  it("fills materials and recipes when a mountain has none yet", () => {
    const bare = dug(40_000);
    const saved = serializeSave({ mountain: bare, lastSeen: 1 });
    expect(saved.version).toBe(6);
    expect(saved.workshop.materials).toEqual({
      clay: 1,
      iron: 0,
      crystal: 0,
      heartstone: 0,
    });
    expect(saved.workshop.recipes).toEqual([...STARTING_RECIPE_IDS]);
    expect(saved.workshop.bench).toBeUndefined();
    expect(saved.mountain).not.toHaveProperty("materials");
  });

  it("treats a null bench as empty and rejects a bad workshop", () => {
    const saved = serializeSave({ mountain: createMountain(), lastSeen: 1 });
    expect(
      parseSaveValue({
        ...saved,
        workshop: { ...saved.workshop, bench: null },
      })?.mountain.bench,
    ).toBeUndefined();
    expect(
      parseSaveValue({
        ...saved,
        workshop: { ...saved.workshop, crafted: {} },
      })?.mountain.crafted,
    ).toBeUndefined();
    expect(
      parseSaveValue({
        ...saved,
        workshop: { ...saved.workshop, chargeUntil: 40 },
      })?.mountain.chargeUntil,
    ).toBe(40);
    for (const workshop of [
      null,
      { materials: saved.workshop.materials },
      { ...saved.workshop, bench: [] },
      { ...saved.workshop, bench: 4 },
      { ...saved.workshop, bench: { recipe: 1, startedAt: 1, endsAt: 2 } },
      {
        ...saved.workshop,
        bench: { recipe: "iron-rails", startedAt: 5, endsAt: 4 },
      },
      { ...saved.workshop, chargeUntil: -1 },
      { ...saved.workshop, chargeUntil: 1.5 },
      { ...saved.workshop, chargeUntil: "soon" },
    ]) {
      expect(parseSaveValue({ ...saved, workshop })).toBeUndefined();
    }
  });

  it("drops an unknown shelf id and an unknown recipe, and keeps the stones", () => {
    const mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 12_000_000,
      pocket: 12_000_000,
      finds: ["pick" as const],
    };
    const saved = serializeSave({ mountain, lastSeen: 4 });
    const loaded = parseSaveValue({
      ...saved,
      mountain: { ...saved.mountain, finds: ["turbo", "pick", "pick"] },
      workshop: {
        ...saved.workshop,
        recipes: ["future-bit", "iron-rails", "iron-rails"],
        bench: { recipe: "future-bit", startedAt: 1, endsAt: 2 },
        crafted: { "future-bit": 2, "sturdy-props": 1 },
      },
    });
    expect(loaded?.mountain.finds).toEqual(["pick"]);
    expect(loaded?.mountain.recipes).toEqual(["iron-rails"]);
    expect(loaded?.mountain.bench).toBeUndefined();
    expect(loaded?.mountain.crafted).toEqual({ "sturdy-props": 1 });
    expect(loaded?.mountain.remaining).toBe(MOUNTAIN_STONES - 12_000_000);
    expect(loaded?.mountain.pocket).toBe(12_000_000);
  });

  it("trusts a v6 pocket and does not grant again", () => {
    const mountain = {
      ...dug(12_000_000),
      materials: { clay: 1, iron: 0, crystal: 0, heartstone: 0 },
      recipes: [...STARTING_RECIPE_IDS],
      bench: {
        recipe: "iron-rails" as const,
        startedAt: 10,
        endsAt: 10 + 60_000,
      },
      crafted: { "iron-rails": 1 },
    };
    expect(
      parseSaveValue(serializeSave({ mountain, lastSeen: 2 }))?.mountain,
    ).toEqual(mountain);
    const { recipes, ...noRecipes } = createMountain();
    expect(recipes).toEqual([...STARTING_RECIPE_IDS]);
    expect(
      parseSaveValue({ version: 6, mountain: noRecipes, lastSeen: 1 }),
    ).toBeUndefined();
    const { materials, ...noMaterials } = createMountain();
    expect(materials?.clay).toBe(0);
    expect(
      parseSaveValue({
        version: 6,
        mountain: { ...noMaterials, recipes: [...STARTING_RECIPE_IDS] },
        lastSeen: 1,
      }),
    ).toBeUndefined();
    expect(
      parseSaveValue({
        version: 6,
        mountain: createMountain(),
        lastSeen: Number.NaN,
      }),
    ).toBeUndefined();
  });

  it("loads a fresh save, a 12M save, and a 60M save with the dug materials", () => {
    const fresh = parseSaveValue({
      version: 5,
      mountain: dug(0),
      lastSeen: 1,
    });
    const twelve = parseSaveValue({
      version: 5,
      mountain: dug(12_000_000),
      lastSeen: 1,
    });
    const sixty = parseSaveValue({
      version: 5,
      mountain: dug(60_000_000),
      lastSeen: 1,
    });
    expect(fresh?.mountain.materials).toEqual({
      clay: 0,
      iron: 0,
      crystal: 0,
      heartstone: 0,
    });
    expect(fresh?.mountain.recipes).toEqual([...STARTING_RECIPE_IDS]);
    expect(minedOut(fresh?.mountain ?? dug(0))).toBe(0);
    expect(twelve?.mountain.materials).toEqual({
      clay: 250,
      iron: 25,
      crystal: 0,
      heartstone: 0,
    });
    expect(twelve?.mountain.recipes).toEqual([
      ...STARTING_RECIPE_IDS,
      "reinforce",
    ]);
    expect(twelve?.mountain.bench).toBeUndefined();
    expect(twelve?.mountain.crafted).toBeUndefined();
    expect(minedOut(twelve?.mountain ?? dug(0))).toBe(12_000_000);
    expect(sixty?.mountain.materials).toEqual({
      clay: 250,
      iron: 437,
      crystal: 93,
      heartstone: 0,
    });
    expect(sixty?.mountain.recipes).toEqual([
      ...STARTING_RECIPE_IDS,
      "reinforce",
      "diamond-bits",
      "crystal-flare",
    ]);
    expect(minedOut(sixty?.mountain ?? dug(0))).toBe(60_000_000);
  });

  it("keeps stones mined from v1 through v5, local or cloud, and grants from them", () => {
    const grid = {
      width: 3,
      height: 3,
      cells: Array.from({ length: 9 }, () => ({ kind: "covered" })),
    };
    const cases = [
      parseSaveValue({ version: 1, grid }),
      parseSaveValue({ version: 2, grid, lastSeen: 8 }),
      parseSaveValue({
        version: 3,
        mountain: { remaining: 980_000, pocket: 4, helpers: 1 },
        lastSeen: 8,
      }),
      parseSaveValue({
        version: 4,
        mountain: { remaining: 88_000_000, pocket: 9, helpers: 2 },
        lastSeen: 8,
      }),
      parseSaveValue({ version: 5, mountain: dug(60_000_000), lastSeen: 8 }),
    ];
    const mined = [0, 0, 2_000_000, 12_000_000, 60_000_000];
    for (const [index, save] of cases.entries()) {
      const stones = mined[index] ?? -1;
      expect(save).toBeDefined();
      expect(minedOut(save?.mountain ?? dug(0))).toBe(stones);
      expect(save?.mountain.materials).toEqual(materialsFromMined(stones));
      expect(save?.mountain.recipes).toEqual(recipesForMined(stones));
      expect(save?.mountain).not.toHaveProperty("layer");
    }
    const tampered = parseSaveValue({
      version: 5,
      mountain: {
        ...dug(12_000_000),
        materials: { clay: 1, iron: 0, crystal: 0, heartstone: 0 },
        bench: {
          recipe: "iron-rails",
          startedAt: 1,
          endsAt: 2,
        },
        crafted: { "iron-rails": 3 },
        recipes: ["crystal-lamp"],
      },
      lastSeen: 3,
    });
    expect(tampered?.mountain.materials).toEqual({
      clay: 250,
      iron: 25,
      crystal: 0,
      heartstone: 0,
    });
    expect(tampered?.mountain.recipes).toEqual([
      ...STARTING_RECIPE_IDS,
      "reinforce",
    ]);
    expect(tampered?.mountain.bench).toBeUndefined();
    expect(tampered?.mountain.crafted).toBeUndefined();
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

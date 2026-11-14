import { NONE_OWNED, patched, type MountainPatch } from "./test-fixtures";
import { describe, expect, it, vi } from "vitest";
import { crewCounts } from "./crew-count";
import { staffForBuy } from "./engineers";
import type { Trouble } from "./hazards";
import {
  bayLamp,
  bayTiers,
  bayViews,
  flapDigits,
  type BayView,
} from "./machine-bays";
import { createMountain, type Mountain } from "./mountain";
import { machineGain } from "./rates";
import { readyNow } from "./ready-now";
import type { RelicId } from "./relics";
import { MOUNTAIN_STONES, shownStones } from "./scale";
import { tierById, tierCost, type MachineId } from "./tiers";

/** Relics forced missing, for a save the real depths cannot make. */
const missing = vi.hoisted(() => ({ relics: new Set<string>() }));

vi.mock("./relics", async (importOriginal) => {
  const real = await importOriginal<typeof import("./relics")>();
  return {
    ...real,
    hasRelic: (mountain: Mountain, id: RelicId) =>
      !missing.relics.has(id) && real.hasRelic(mountain, id),
  };
});

const NOW = 1_700_000_000_000;

function mountainWith(fields: MountainPatch): Mountain {
  return patched(createMountain(), fields);
}

/** Stones mined out so far: this deep. */
function at(depth: number): Pick<Mountain, "remaining"> {
  return { remaining: MOUNTAIN_STONES - depth };
}

function priceOf(mountain: Mountain, id: MachineId, owned: number): number {
  return tierCost(tierById(id), owned, mountain.stretch);
}

/** The three bays, read as the board would: with this frame's Ready pick. */
function views(
  mountain: Mountain,
  trouble?: Trouble,
): readonly [BayView, BayView, BayView] {
  return bayViews(mountain, NOW, trouble, readyNow(mountain, NOW, trouble));
}

/**
 * The early save: 18 workers, 6 carts, 3 hoists and 3 drills. The hoists and
 * drills outrun the haul, so carts are the pick (#536), and the third drill
 * adds nothing, so its hand is free with six others: 7 free.
 */
const early = mountainWith({
  stock: { stones: 6_854 },
  owned: { ...NONE_OWNED, helper: 18, cart: 6, hoist: 3, drill: 3 },
});

describe("bayTiers", () => {
  it("cart, drill and borer until the Great Machine is on sale", () => {
    const early3 = ["cart", "drill", "borer"];
    const late3 = ["drill", "borer", "machine"];

    expect(bayTiers(createMountain())).toEqual(early3);
    expect(bayTiers(mountainWith(at(119_000_000)))).toEqual(early3);
    expect(bayTiers(mountainWith(at(125_000_000)))).toEqual(late3);

    // The Hammer comes at 25M, so only a forced save is this deep without it.
    missing.relics.add("hammer");
    try {
      expect(bayTiers(mountainWith(at(125_000_000)))).toEqual(early3);
    } finally {
      missing.relics.clear();
    }

    // A cloud copy that already runs one keeps its bay, before the Deep Heart
    // and even before the Hammer.
    expect(
      bayTiers(
        mountainWith({
          ...at(30_000_000),
          owned: { ...NONE_OWNED, machine: 1 },
        }),
      ),
    ).toEqual(late3);
    expect(
      bayTiers(
        mountainWith({
          ...at(20_000_000),
          owned: { ...NONE_OWNED, machine: 1 },
        }),
      ),
    ).toEqual(late3);

    // A kid's run opens the machine at 0.9 of its depth: 108M.
    expect(bayTiers(mountainWith({ ...at(109_000_000), stretch: 2 }))).toEqual(
      late3,
    );
    expect(bayTiers(mountainWith({ ...at(107_000_000), stretch: 2 }))).toEqual(
      early3,
    );
  });
});

describe("bayViews", () => {
  it("each bay's state", () => {
    const [cart, drill, borer] = views(early);

    expect(cart).toEqual({
      kind: "open",
      tier: "cart",
      count: 6,
      price: priceOf(early, "cart", 6),
      // What one more adds to the line, as its Buys row reads it (#536).
      gain: machineGain(early, "cart", 1, NOW),
      staff: 1,
      lamp: "amber",
    });
    expect(drill).toEqual({
      kind: "open",
      tier: "drill",
      count: 3,
      price: priceOf(early, "drill", 3),
      gain: machineGain(early, "drill", 1, NOW),
      staff: staffForBuy(early, tierById("drill")),
      lamp: "off",
    });
    expect(borer).toEqual({
      kind: "locked",
      tier: "borer",
      count: 0,
      lock: {
        kind: "depth",
        depth: 10_000_000,
        at: shownStones(early, 10_000_000),
      },
    });
    expect([cart, drill, borer].map(bayLamp)).toEqual(["amber", "off", "off"]);
  });

  it("green is ready but not the pick", () => {
    const mountain = {
      ...early,
      stock: { ...early.stock, stones: priceOf(early, "drill", 3) + 1 },
    };
    expect(mountain.stock.stones).toBeGreaterThan(priceOf(early, "cart", 6));
    expect(crewCounts(mountain, NOW).free).toBe(7);

    const [cart, drill] = views(mountain);
    expect(bayLamp(cart)).toBe("amber");
    expect(bayLamp(drill)).toBe("green");
  });

  it("short of hands is dark", () => {
    const mountain = mountainWith({
      // Three workers on a cart, a hoist and a drill: every hand is needed.
      owned: { ...NONE_OWNED, helper: 3, cart: 1, hoist: 1, drill: 1 },
      stock: { stones: priceOf(early, "cart", 6) + 1 },
    });
    expect(crewCounts(mountain, NOW).free).toBe(0);

    const [cart] = views(mountain);
    expect(cart).toMatchObject({ kind: "open", lamp: "off" });
    expect(bayLamp(cart)).toBe("off");
  });

  it("the Great Machine era shows drill, borer and machine", () => {
    const mountain = mountainWith({
      ...at(125_000_000),
      owned: {
        ...NONE_OWNED,
        helper: 40,
        cart: 6,
        drill: 4,
        borer: 2,
        machine: 1,
      },
      stock: { stones: 1_000 },
    });
    const shown = views(mountain);

    expect(shown.map((view) => view.tier)).toEqual([
      "drill",
      "borer",
      "machine",
    ]);
    expect(shown.map((view) => view.count)).toEqual([4, 2, 1]);
    expect(shown[2]).toMatchObject({
      kind: "open",
      price: priceOf(mountain, "machine", 1),
      staff: staffForBuy(mountain, tierById("machine")),
    });
  });

  it("trouble shows on its bay", () => {
    const caveIn: Trouble = { kind: "cave-in", tier: "cart", startedAt: NOW };
    const [cart, drill] = views(early, caveIn);

    expect(cart).toEqual({
      kind: "trouble",
      tier: "cart",
      count: 6,
      price: priceOf(early, "cart", 6),
      gain: machineGain(early, "cart", 1, NOW, caveIn),
      staff: 1,
      trouble: "cave-in",
    });
    expect(bayLamp(cart)).toBe("red");
    expect(drill.kind).toBe("open");

    // Impossible in play (a locked borer never jams), but trouble wins.
    const jam: Trouble = { kind: "jam", tier: "borer", startedAt: NOW };
    const borer = views(early, jam)[2];
    expect(borer).toMatchObject({
      kind: "trouble",
      tier: "borer",
      count: 0,
      price: priceOf(early, "borer", 0),
      staff: 8,
      trouble: "jam",
    });
    expect(bayLamp(borer)).toBe("red");
  });

  it("a mined-out mountain lights no amber", () => {
    // At the bottom the bays are drill, borer and machine.
    const mountain = {
      ...early,
      remaining: 0,
      stock: { ...early.stock, stones: priceOf(early, "drill", 3) },
    };
    const pick = readyNow(mountain, NOW);
    expect(pick.kind).toBe("mined-out");

    const [drill] = bayViews(mountain, NOW, undefined, pick);
    expect(drill).toMatchObject({ kind: "open", tier: "drill" });
    expect(bayLamp(drill)).toBe("green");
  });

  it("display only", () => {
    const mountain = Object.freeze(
      mountainWith({
        ...early,
        engineers: Object.freeze([
          Object.freeze({ name: "Ada", rank: 0, trips: 0, post: "borer" }),
        ]),
      }),
    );
    const before = structuredClone(mountain);

    bayTiers(mountain);
    views(mountain);
    views(mountain, { kind: "cave-in", tier: "cart", startedAt: NOW });

    expect(mountain).toEqual(before);
  });
});

describe("flapDigits", () => {
  it("flap digits", () => {
    const counts = [0, 7, 9, 10, 42, 99, 100, 250, 999, 1_000, 5_000, NaN, -3];
    expect(counts.map(flapDigits)).toEqual([
      " 0",
      " 7",
      " 9",
      "10",
      "42",
      "99",
      "100",
      "250",
      "999",
      "999",
      "999",
      " 0",
      " 0",
    ]);
  });
});

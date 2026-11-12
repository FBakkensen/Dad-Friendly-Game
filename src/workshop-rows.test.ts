import { describe, expect, it } from "vitest";
import { LAYERS, materialsFromMined, EMPTY_MATERIALS } from "./layers";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import {
  BENCH_FREE,
  BENCH_UNKNOWN,
  BENCH_UNKNOWN_ASIDE,
  BENCH_BUSY_ASIDE,
  RECIPES_LEGEND,
  SKETCH_NAME,
  WORKSHOP_CANCEL_CONFIRM,
  WORKSHOP_FREE_ASIDE,
  WORKSHOP_KICK,
} from "./screen-words";
import { markSeen, recordFirstUse } from "./teach";
import { minedMountain } from "./test-fixtures";
import {
  recipesForMined,
  startCraft,
  type RecipeId,
  NOTHING_KEPT,
} from "./workshop";
import {
  benchView,
  workshopCards,
  workshopPages,
  type HiddenCard,
  type RecipeCard,
  type WorkshopCard,
} from "./workshop-sheet";
import {
  FIRST_CRAFT,
  teachFirst,
  workshopTeach,
  type WorkshopTeach,
} from "./workshop-teach";
import {
  RECIPES_A_PAGE,
  benchRowView,
  materialPlates,
  partIdOf,
  recipeRowView,
  sketchRowView,
  workshopOrder,
} from "./workshop-rows";

const NOW = 1_700_000_000_000;
const QUIET: WorkshopTeach = {};

/** The Granite shed workshop-panel.test.ts uses: a little clay and iron, 200K stones. */
function granite(): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 12_000_000,
    pocket: 200_000,
    helpers: 4,
    carts: 1,
    materials: { clay: 2, iron: 1, crystal: 0, heartstone: 0 },
    recipes: recipesForMined(12_000_000),
  };
}

/** The same shed with Sturdy props on the bench and nothing left in the pocket. */
function busy(): Mountain {
  return {
    ...granite(),
    pocket: 0,
    materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
    bench: {
      recipe: "sturdy-props",
      startedAt: NOW,
      endsAt: NOW + 600_000,
    },
  };
}

/** The dad the day the Workshop opens (workshop-teach.test.ts). */
function opening(): Mountain {
  const granite = LAYERS[1].from;
  return {
    ...minedMountain(granite),
    pocket: 400_000,
    helpers: 40,
    materials: materialsFromMined(granite),
  };
}

function recipe(cards: readonly WorkshopCard[], id: RecipeId): RecipeCard {
  const card = cards.find(
    (item): item is RecipeCard => item.kind === "recipe" && item.id === id,
  );
  if (card === undefined) {
    throw new Error(`missing ${id}`);
  }
  return card;
}

function sketch(cards: readonly WorkshopCard[]): HiddenCard {
  const card = cards.find((item): item is HiddenCard => item.kind === "hidden");
  if (card === undefined) {
    throw new Error("no sketch");
  }
  return card;
}

describe("the Workshop drawer's new words (#374)", () => {
  it("are the mockup's kick, the legend and the sketch's name", () => {
    expect(WORKSHOP_KICK).toBe("One bench. Crafts finish while you are away");
    expect(RECIPES_LEGEND).toBe("Recipes");
    expect(SKETCH_NAME).toBe("Sketch");
  });
});

describe("a recipe row (#374)", () => {
  it("a craft he can make: green, ready, Craft, the materials and the stones tag", () => {
    const card = recipe(workshopCards(granite(), NOW), "axle-grease");
    expect(card.action.kind).toBe("craft");
    const row = recipeRowView(card, QUIET);
    expect(row).toMatchObject({
      name: "Axle grease",
      badge: card.level ?? "",
      info: [card.effect],
      gain: card.time,
      lamp: "green",
      state: "ready",
      verb: "Craft",
      need: "",
      why: card.costs.map((cost) => cost.text).join(" · "),
      price: card.stonesTag ?? "",
      dimTag: false,
      can: true,
      pick: false,
      flag: [],
    });
  });

  it("names the level as its badge, the materials on the third line and 500K on the tag", () => {
    const rich: Mountain = {
      ...granite(),
      pocket: 80_000_000,
      materials: { clay: 40, iron: 40, crystal: 0, heartstone: 0 },
    };
    const row = recipeRowView(
      recipe(workshopCards(rich, NOW), "iron-rails"),
      QUIET,
    );
    expect(row.badge).toBe("Lv 0/2");
    expect(row.why).toBe("4 iron");
    expect(row.price).toBe("500K");
    expect(row.gain).toBe("10 min");
    expect(row.aria).toBe(
      "Iron rails. Carts 6/s to 7.5/s. Craft: 500K stones, 4 iron.",
    );
  });

  it("a short craft: dark, its need instead of the materials, the tag dim, no tap (#492: the Granite has no clay)", () => {
    const card = recipe(workshopCards(granite(), NOW), "blasting-charge");
    const row = recipeRowView(card, QUIET);
    expect(row).toMatchObject({
      lamp: "off",
      state: "short",
      verb: "Craft",
      need: "No clay this deep",
      why: "",
      price: card.stonesTag ?? "",
      dimTag: true,
      can: false,
    });
    expect(row.aria).toBe(
      `Blasting charge. ${card.effect.replace(/\.?$/, ".")} No clay this deep.`,
    );
  });

  it("a craft waiting on a busy bench: dark, dear, Bench busy, the tag dim", () => {
    const card = recipe(workshopCards(busy(), NOW + 60_000), "iron-rails");
    const row = recipeRowView(card, QUIET);
    expect(row).toMatchObject({
      lamp: "off",
      state: "dear",
      verb: "Bench busy",
      need: "",
      why: "4 iron",
      price: "500K",
      dimTag: true,
      can: false,
    });
  });

  it("the craft on the bench: amber, running, On the bench, no tag", () => {
    const card = recipe(workshopCards(busy(), NOW + 60_000), "sturdy-props");
    const row = recipeRowView(card, QUIET);
    expect(row).toMatchObject({
      lamp: "amber",
      state: "running",
      verb: "On the bench",
      need: "",
      why: card.costs.map((cost) => cost.text).join(" · "),
      price: "",
      dimTag: false,
      can: false,
    });
    expect(row.aria).toMatch(/^Sturdy props\. .+\. On the bench: .+\.$/);
  });

  it("flags the New craft on a first visit, only while he can make it", () => {
    const first = markSeen(opening(), "workshop");
    const teach = workshopTeach(first, 0);
    const card = recipe(workshopCards(first, 0), FIRST_CRAFT);
    expect(recipeRowView(card, teach).flag).toEqual(["New"]);
    expect(recipeRowView(card, teach).isNew).toBe(true);
    const short = recipe(workshopCards(granite(), NOW), FIRST_CRAFT);
    expect(recipeRowView(short, teach).flag).toEqual([]);
    expect(recipeRowView(short, teach).isNew).toBe(false);
    const other = recipe(workshopCards(granite(), NOW), "axle-grease");
    expect(other.action.kind).toBe("craft");
    expect(recipeRowView(other, teach).flag).toEqual([]);
    expect(recipeRowView(other, teach).isNew).toBe(false);
  });

  it("flags the payoff on the first charge while it works", () => {
    const crafted = recordFirstUse(startCraft(opening(), FIRST_CRAFT, 1_000));
    const teach = workshopTeach(crafted, 2_000);
    const card = recipe(workshopCards(crafted, 2_000), FIRST_CRAFT);
    const flag = recipeRowView(card, teach).flag;
    expect(recipeRowView(card, teach).isNew).toBe(false);
    expect(flag).toHaveLength(1);
    expect(flag[0]).toMatch(/^\+[\d,]+\/s now$/);
  });
});

describe("the sketch row (#374)", () => {
  it("is named Sketch, shows today's hint, and is dark and locked", () => {
    const card = sketch(workshopCards(granite(), NOW));
    const row = sketchRowView(card);
    expect(row).toMatchObject({
      name: "Sketch",
      info: [card.hint],
      lamp: "off",
      state: "locked",
      verb: "",
      price: "",
      need: "",
      why: "",
      gain: "",
      flag: [],
      can: false,
    });
    expect(row.aria).toBe(`Sketch. ${card.hint}`);
  });
});

describe("the bench row (#374)", () => {
  it("a free bench: dark and ready, with no clock, bar or cancel", () => {
    const row = benchRowView(benchView(granite(), NOW), false);
    expect(row).toMatchObject({
      name: BENCH_FREE,
      info: [WORKSHOP_FREE_ASIDE],
      lamp: "off",
      state: "ready",
      gain: "",
      why: "",
      canCancel: false,
      can: false,
      progress: undefined,
    });
    expect(row.aria).toBe(`${BENCH_FREE}. ${WORKSHOP_FREE_ASIDE}`);
  });

  it("a busy bench: the recipe, the refund then the aside, the clock and the bar", () => {
    const view = benchView(busy(), NOW + 60_000);
    const row = benchRowView(view, false);
    expect(row).toMatchObject({
      name: "Sturdy props",
      info: [
        "Cancel · 250K stones, 10 clay, and 4 iron back",
        BENCH_BUSY_ASIDE,
      ],
      gain: "9:00",
      why: "",
      lamp: "amber",
      state: "running",
      canCancel: true,
      can: true,
    });
    expect(row.progress).toBeCloseTo(0.1);
    expect(row.aria).toBe(
      "On the bench: Sturdy props · 9:00 left. Cancel · 250K stones, 10 clay, and 4 iron back",
    );
  });

  it("armed, the third line asks for the second tap", () => {
    const row = benchRowView(benchView(busy(), NOW + 60_000), true);
    expect(row.why).toBe(WORKSHOP_CANCEL_CONFIRM);
    expect(row.aria).toBe(
      `On the bench: Sturdy props · 9:00 left. ${WORKSHOP_CANCEL_CONFIRM}`,
    );
  });

  it("once the clock has rung there is nothing to cancel, armed or not", () => {
    const view = benchView(busy(), NOW + 600_000);
    expect(view.kind === "busy" && view.cancel).toBe("");
    for (const armed of [false, true]) {
      const row = benchRowView(view, armed);
      expect(row).toMatchObject({
        info: [BENCH_BUSY_ASIDE],
        gain: "ready",
        why: "",
        canCancel: false,
        can: false,
      });
      expect(row.aria).toBe("On the bench: Sturdy props · ready");
    }
  });

  it("a bench this build cannot name: amber with its clock and bar, and no cancel", () => {
    const held: Mountain = {
      ...granite(),
      kept: {
        ...NOTHING_KEPT,
        bench: { recipe: "future-bit", startedAt: NOW, endsAt: NOW + 600_000 },
      },
    };
    for (const armed of [false, true]) {
      const row = benchRowView(benchView(held, NOW + 60_000), armed);
      expect(row).toMatchObject({
        name: BENCH_UNKNOWN,
        info: [BENCH_UNKNOWN_ASIDE],
        gain: "9:00",
        why: "",
        lamp: "amber",
        state: "running",
        canCancel: false,
        can: false,
      });
      expect(row.progress).toBeCloseTo(0.1);
      expect(row.aria).toBe(
        `${BENCH_UNKNOWN} · 9:00 left. ${BENCH_UNKNOWN_ASIDE}`,
      );
    }
  });
});

describe("the material plates (#374)", () => {
  const shed = (materials: NonNullable<Mountain["materials"]>): Mountain => ({
    ...granite(),
    materials,
  });

  it("two plates: clay then iron, their counts, words and labels", () => {
    expect(
      materialPlates(shed({ clay: 10, iron: 4, crystal: 0, heartstone: 0 })),
    ).toEqual([
      {
        id: "clay",
        count: "10",
        word: "clay",
        aria: "Clay 10. How materials work",
      },
      {
        id: "iron",
        count: "4",
        word: "iron",
        aria: "Iron 4. How materials work",
      },
    ]);
  });

  it("three and four plates, in the layers' order", () => {
    expect(
      materialPlates(shed({ clay: 1, iron: 2, crystal: 3, heartstone: 0 })).map(
        (plate) => plate.id,
      ),
    ).toEqual(["clay", "iron", "crystal"]);
    const four = materialPlates(
      shed({ clay: 1, iron: 2, crystal: 3, heartstone: 1_500_000 }),
    );
    expect(four.map((plate) => plate.id)).toEqual([
      "clay",
      "iron",
      "crystal",
      "heartstone",
    ]);
    expect(four[3]).toEqual({
      id: "heartstone",
      count: "1.5M",
      word: "heartstone",
      aria: "Heartstone 1.5M. How materials work",
    });
  });

  it("a material spent to zero keeps its plate with 0", () => {
    const plates = materialPlates(
      shed({ clay: 0, iron: 0, crystal: 0, heartstone: 0 }),
    );
    expect(plates.map((plate) => [plate.id, plate.count])).toEqual([
      ["clay", "0"],
      ["iron", "0"],
    ]);
  });

  it("an old save with no pocket of ore yet counts what it has earned as 0", () => {
    const old: Mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 1_000_000,
      materials: EMPTY_MATERIALS,
    };
    expect(materialPlates(old)).toEqual([
      {
        id: "clay",
        count: "0",
        word: "clay",
        aria: "Clay 0. How materials work",
      },
    ]);
  });

  it("no plates before any ore is met", () => {
    expect(materialPlates(createMountain())).toEqual([]);
  });
});

describe("the order and the pages (#374)", () => {
  it("names each card's part: its recipe, or the sketch", () => {
    const cards = workshopCards(granite(), NOW);
    expect(partIdOf(recipe(cards, "axle-grease"))).toBe("recipe:axle-grease");
    expect(partIdOf(sketch(cards))).toBe("sketch");
  });

  it("keeps teachFirst's order, the sketch included", () => {
    const first = markSeen(opening(), "workshop");
    const ordered = teachFirst(
      workshopCards(first, 0),
      workshopTeach(first, 0),
    );
    const order = workshopOrder(ordered);
    expect(order).toEqual(ordered.map(partIdOf));
    expect(order[0]).toBe(`recipe:${FIRST_CRAFT}`);
    expect(order).toContain("sketch");
  });

  it("pages it in threes", () => {
    expect(RECIPES_A_PAGE).toBe(3);
    const order = workshopOrder(workshopCards(granite(), NOW));
    const pages = workshopPages(order, RECIPES_A_PAGE);
    expect(pages.length).toBe(Math.ceil(order.length / 3));
    expect(pages[0]).toHaveLength(3);
    expect(pages.flat()).toEqual(order);
  });
});

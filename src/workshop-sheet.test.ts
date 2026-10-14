import { describe, expect, it } from "vitest";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import {
  benchLeftMs,
  benchView,
  craftShortfall,
  fittedEffect,
  metMaterialChips,
  timerLines,
  workshopCards,
  workshopPages,
  type RecipeCard,
  type WorkshopCard,
} from "./workshop-sheet";
import { RECIPE_IDS, recipesForMined, type RecipeId } from "./workshop";

const FULL = {
  clay: 40,
  iron: 40,
  crystal: 20,
  heartstone: 12,
} as const;

function shed(extra: Partial<Mountain> = {}): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 12_000_000,
    pocket: 80_000_000,
    helpers: 4,
    carts: 1,
    materials: { ...FULL, crystal: 0, heartstone: 0 },
    recipes: recipesForMined(12_000_000),
    ...extra,
  };
}

function recipe(cards: readonly WorkshopCard[], id: RecipeId): RecipeCard {
  const card = cards.find(
    (item) => item.kind === "recipe" && "id" in item && item.id === id,
  );
  if (card === undefined || card.kind !== "recipe") {
    throw new Error(`missing ${id}`);
  }
  return card;
}

describe("workshop sheet (#199)", () => {
  it("shows the materials already met and the real craft numbers", () => {
    const mountain = shed();
    expect(metMaterialChips(mountain).map((chip) => chip.text)).toEqual([
      "Clay 40",
      "Iron 40",
    ]);
    expect(metMaterialChips(mountain).map((chip) => chip.id)).not.toContain(
      "crystal",
    );
    expect(metMaterialChips(createMountain())).toEqual([]);
    expect(
      metMaterialChips({
        ...createMountain(),
        remaining: MOUNTAIN_STONES - 1,
      }),
    ).toEqual([]);
    expect(
      metMaterialChips({
        ...createMountain(),
        remaining: MOUNTAIN_STONES - 1_000_000,
        materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      }).map((chip) => chip.text),
    ).toEqual(["Clay 0"]);
    expect(
      metMaterialChips({
        ...createMountain(),
        materials: { clay: 3, iron: 0, crystal: 0, heartstone: 0 },
      }).map((chip) => chip.text),
    ).toEqual(["Clay 3"]);
    const cards = workshopCards(mountain, 1_000);
    const rails = recipe(cards, "iron-rails");
    expect(rails.name).toBe("Iron rails");
    expect(rails.level).toBe("Level 1 of 2");
    expect(rails.effect).toBe("Carts 8.5/s to 10.6/s");
    expect(rails.stones).toBe("500K stones");
    expect(rails.costs.map((cost) => cost.text)).toEqual(["4 iron"]);
    expect(rails.time).toBe("10 min");
    expect(rails.action).toEqual({ kind: "craft", label: "Craft · 500K" });
    expect(recipe(cards, "sturdy-props").effect).toBe(
      "Trouble comes 30% less often.",
    );
    expect(recipe(cards, "reinforce").name).toBe("Reinforce");
    expect(recipe(cards, "reinforce").level).toBe("Level 1 of 5");
    expect(recipe(cards, "reinforce").stones).toBeUndefined();
    expect(recipe(cards, "reinforce").effect).toBe("Drills 60/s to 63/s");
    expect(recipe(cards, "reinforce").action).toEqual({
      kind: "craft",
      label: "Craft",
    });
    const charge = recipe(cards, "blasting-charge");
    expect(charge.effect).toMatch(/^Crew .+\/s to .+\/s for 20 min\.$/);
    expect(charge.effect).toMatch(/\d/);
    const hidden = cards.find((card) => card.kind === "hidden");
    expect(hidden?.kind === "hidden" ? hidden.hint : "").toBe(
      "A folded sketch, still in the dark.",
    );
    expect(hidden?.kind === "hidden" ? hidden.hint : "x").not.toMatch(/[0-9?]/);
    expect(workshopPages(cards)).toHaveLength(2);
    expect(workshopPages(cards)[0]).toHaveLength(4);
  });

  it("greys a short craft with the first missing material", () => {
    const poor = shed({
      pocket: 200_000,
      materials: { clay: 2, iron: 1, crystal: 0, heartstone: 0 },
    });
    expect(craftShortfall(poor, "iron-rails")).toEqual({
      missing: 3,
      material: "iron",
    });
    expect(craftShortfall(poor, "blasting-charge")).toEqual({
      missing: 2,
      material: "clay",
    });
    const stones = shed({
      pocket: 50_000,
      materials: { ...FULL },
    });
    expect(craftShortfall(stones, "iron-rails")).toEqual({
      missing: 450_000,
      material: "stones",
    });
    const axle = recipe(workshopCards(poor, 0), "axle-grease");
    expect(axle.action).toEqual({ kind: "craft", label: "Craft" });
    const rails = recipe(workshopCards(poor, 0), "iron-rails");
    expect(rails.action).toEqual({
      kind: "short",
      label: "Need 3 more iron",
    });
  });

  it("keeps a free bench gentle and a busy one honest about the refund", () => {
    const free = benchView(shed(), 0);
    expect(free).toMatchObject({
      kind: "free",
      title: "The bench is free",
      aside: "A little at a time is plenty.",
    });
    expect(benchLeftMs(shed(), 0)).toBeUndefined();
    const started = {
      ...shed({ materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 } }),
      bench: {
        recipe: "sturdy-props" as const,
        startedAt: 0,
        endsAt: 600_000,
      },
    };
    const busy = benchView(started, 60_000);
    expect(busy.kind).toBe("busy");
    if (busy.kind !== "busy") {
      return;
    }
    expect(busy.title).toBe("On the bench: Sturdy props · 9:00 left");
    expect(busy.cancel).toBe("Cancel · 250K stones, 10 clay, and 4 iron back");
    expect(busy.progress).toBeCloseTo(0.1);
    expect(benchLeftMs(started, 60_000)).toBe(540_000);
    const waiting = recipe(workshopCards(started, 60_000), "iron-rails");
    expect(waiting.action.kind).toBe("waiting");
    expect(waiting.stones).toBe("500K stones");
    expect(waiting.costs.map((cost) => cost.text)).toEqual(["4 iron"]);
    expect(waiting.time).toBe("10 min");
    const onBench = recipe(workshopCards(started, 60_000), "sturdy-props");
    expect(onBench.action.kind).toBe("on-bench");
    expect(benchView(started, 600_000)).toMatchObject({
      kind: "busy",
      title: "On the bench: Sturdy props · ready",
      cancel: "",
    });
    expect(benchLeftMs(started, 600_000)).toBeUndefined();
    const held = shed({
      kept: {
        bench: { recipe: "future-bit", startedAt: 0, endsAt: 600_000 },
      },
    });
    const unknown = benchView(held, 60_000);
    expect(unknown).toEqual({
      kind: "unknown",
      title: "Something is on the bench · 9:00 left",
      aside: "It keeps working while you rest.",
      progress: 0.1,
    });
    expect(benchLeftMs(held, 60_000)).toBe(540_000);
    expect(recipe(workshopCards(held, 60_000), "iron-rails").action.kind).toBe(
      "waiting",
    );
    expect(benchView(held, 600_000).kind).toBe("free");
    expect(benchLeftMs(held, 600_000)).toBeUndefined();
  });

  it("counts a live timer and refunds only what is left", () => {
    const greased = shed({
      helpers: 0,
      carts: 0,
      axleUntil: 20 * 60_000,
      bench: {
        recipe: "axle-grease",
        startedAt: 0,
        endsAt: 10 * 60_000,
      },
    });
    expect(timerLines(greased, 60_000)[0]).toMatch(/Axle grease · 19:00 left/);
    expect(
      benchView(greased, 9 * 60_000).kind === "busy"
        ? benchView(greased, 9 * 60_000)
        : undefined,
    ).toMatchObject({ cancel: "Cancel · nothing comes back" });
    const hot = shed({ chargeUntil: 30 * 60_000, helpers: 4, carts: 1 });
    expect(recipe(workshopCards(hot, 1_000), "blasting-charge").effect).toMatch(
      /keeps digging at 2×/,
    );
    const cold = shed({ helpers: 0, carts: 0 });
    expect(recipe(workshopCards(cold, 1_000), "blasting-charge").effect).toBe(
      "The crew digs at 2× for 20 min.",
    );
    const charged = shed({ chargeUntil: 30 * 60_000, helpers: 4, carts: 1 });
    const grease = recipe(workshopCards(charged, 1_000), "axle-grease");
    expect(grease.effect).toBe("Crew already at ×2.");
    const overtime = shed({
      helpers: 4,
      carts: 1,
      boosts: { overtime: 30 * 60_000 },
    });
    expect(
      recipe(workshopCards(overtime, 1_000), "blasting-charge").effect,
    ).toBe("Crew already at ×2.");
    for (const card of [
      ...workshopCards(charged, 1_000),
      ...workshopCards(overtime, 1_000),
      ...workshopCards(shed(), 1_000),
    ]) {
      if (card.kind === "recipe") {
        expect(card.effect).not.toMatch(/×4|x4|4×/);
      }
    }
  });

  it("names the next machine and hides a finished craft", () => {
    const bare = shed({ carts: 0, helpers: 0 });
    expect(recipe(workshopCards(bare, 0), "reinforce").effect).toBe(
      "The next machine digs 5% faster.",
    );
    const drills = shed({ drills: 1, carts: 2, helpers: 8 });
    expect(recipe(workshopCards(drills, 0), "reinforce").effect).toMatch(
      /^Borers /,
    );
    const deep = shed({
      remaining: MOUNTAIN_STONES - 130_000_000,
      borers: 1,
      drills: 1,
      carts: 2,
      helpers: 20,
      machines: 1,
      materials: { ...FULL },
      recipes: [...RECIPE_IDS],
    });
    expect(recipe(workshopCards(deep, 0), "reinforce").effect).toMatch(
      /^Great Machine /,
    );
    expect(recipe(workshopCards(deep, 0), "heartstone-core").effect).toMatch(
      /Great Machine .+\/s to .+\/s/,
    );
    expect(recipe(workshopCards(deep, 0), "heartstone-ember").effect).toMatch(
      /for 20 min/,
    );
    expect(recipe(workshopCards(deep, 0), "diamond-bits").effect).toMatch(
      /^Drills /,
    );
    expect(recipe(workshopCards(deep, 0), "crystal-flare").effect).toMatch(
      /more often for 1 h/,
    );
    expect(recipe(workshopCards(deep, 0), "crystal-lamp").effect).toMatch(
      /Golden veins .+ more often/,
    );
    expect(recipe(workshopCards(deep, 0), "engineers-kit").effect).toBe(
      "Long trips 4 h to 3 h 12 min.",
    );
    const done = shed({ crafted: { "iron-rails": 2, "sturdy-props": 1 } });
    const names = workshopCards(done, 0).map((card) =>
      card.kind === "recipe" ? card.id : card.kind,
    );
    expect(names).not.toContain("iron-rails");
    expect(names).not.toContain("sturdy-props");
    const known = shed({
      recipes: RECIPE_IDS.filter((id) => id !== "crystal-lamp"),
    });
    const hint = workshopCards(known, 0).find((card) => card.kind === "hidden");
    expect(hint?.kind === "hidden" ? hint.hint : "").toBe(
      "A folded sketch, still in the dark.",
    );
    const deeper = shed({
      recipes: RECIPE_IDS.filter((id) => id !== "heartstone-core"),
    });
    const deepHint = workshopCards(deeper, 0).find(
      (card) => card.kind === "hidden",
    );
    expect(deepHint?.kind === "hidden" ? deepHint.hint : "").toBe(
      "Deeper rock keeps a quiet gift.",
    );
    expect(workshopPages([])).toEqual([[]]);
    const flareHot = shed({
      recipes: [...RECIPE_IDS],
      materials: { ...FULL },
      flareUntil: 2 * 60 * 60_000,
      emberUntil: 30 * 60_000,
      machines: 1,
      helpers: 25,
    });
    expect(
      recipe(workshopCards(flareHot, 1_000), "crystal-flare").effect,
    ).toMatch(/stay lively/);
    expect(
      recipe(workshopCards(flareHot, 1_000), "heartstone-ember").effect,
    ).toMatch(/keeps this lift/);
    expect(timerLines(shed(), 0)).toEqual([]);
  });
});

describe("fitted effect", () => {
  const now = 0;
  const minute = 60_000;

  it("states the real tier speed, including granite on the carts", () => {
    const soft = {
      ...createMountain(),
      helpers: 1,
      carts: 1,
      crafted: { "iron-rails": 1 },
    };
    expect(fittedEffect(soft, "iron-rails", now)).toBe("Carts now 12.5/s.");
    expect(
      fittedEffect(
        { ...soft, remaining: MOUNTAIN_STONES - 12_000_000 },
        "iron-rails",
        now,
      ),
    ).toBe("Carts now 10.6/s.");
    expect(
      fittedEffect(
        {
          ...createMountain(),
          drills: 1,
          helpers: 3,
          crafted: { "diamond-bits": 1 },
        },
        "diamond-bits",
        now,
      ),
    ).toMatch(/^Drills now /);
    expect(
      fittedEffect(
        {
          ...createMountain(),
          machines: 1,
          helpers: 25,
          crafted: { "heartstone-core": 1 },
        },
        "heartstone-core",
        now,
      ),
    ).toMatch(/^Great Machine now /);
  });

  it("states props, the lamp, and a long trip", () => {
    expect(fittedEffect(createMountain(), "sturdy-props", now)).toBe(
      "Trouble stays a little further off.",
    );
    expect(
      fittedEffect(
        { ...createMountain(), crafted: { "sturdy-props": 1 } },
        "sturdy-props",
        now,
      ),
    ).toBe("Trouble comes 30% less often.");
    expect(fittedEffect(createMountain(), "crystal-lamp", now)).toBe(
      "Golden veins keep coming.",
    );
    expect(
      fittedEffect(
        { ...createMountain(), crafted: { "crystal-lamp": 1 } },
        "crystal-lamp",
        now,
      ),
    ).toBe("Golden veins 25% more often.");
    expect(fittedEffect(createMountain(), "engineers-kit", now)).toMatch(
      /^Long trips now \d/,
    );
  });

  it("states a live crew timer, including when another is already that strong", () => {
    expect(
      fittedEffect(
        { ...createMountain(), chargeUntil: 20 * minute },
        "blasting-charge",
        now,
      ),
    ).toBe("The crew digs at 2× for 20 min.");
    expect(
      fittedEffect(
        { ...createMountain(), helpers: 4, chargeUntil: 20 * minute },
        "blasting-charge",
        now,
      ),
    ).toBe("Crew now 8/s for 20 min.");
    expect(
      fittedEffect(
        {
          ...createMountain(),
          helpers: 4,
          chargeUntil: 20 * minute,
          boosts: { overtime: minute },
        },
        "blasting-charge",
        now,
      ),
    ).toBe("Crew already at ×2.");
    expect(
      fittedEffect(
        { ...createMountain(), helpers: 4, axleUntil: 20 * minute },
        "axle-grease",
        now,
      ),
    ).toBe("Crew now 8/s for 20 min.");
  });

  it("states a flare, an ember, and reinforce", () => {
    expect(fittedEffect(createMountain(), "crystal-flare", now)).toBe(
      "Veins stay lively for 0 min.",
    );
    expect(
      fittedEffect(
        { ...createMountain(), flareUntil: 60 * minute },
        "crystal-flare",
        now,
      ),
    ).toBe("Veins 25% more often for 1 h.");
    expect(fittedEffect(createMountain(), "heartstone-ember", now)).toBe(
      "The Great Machine keeps this lift for 0 min.",
    );
    expect(
      fittedEffect(
        {
          ...createMountain(),
          machines: 1,
          helpers: 25,
          emberUntil: 20 * minute,
        },
        "heartstone-ember",
        now,
      ),
    ).toMatch(/^Great Machine now .+\/s for 20 min\.$/);
    expect(fittedEffect(createMountain(), "reinforce", now)).toBe(
      "The next machine digs 5% faster.",
    );
    expect(
      fittedEffect({ ...createMountain(), carts: 1 }, "reinforce", now),
    ).toMatch(/^Drills now /);
    expect(
      fittedEffect(
        { ...createMountain(), carts: 1, drills: 1 },
        "reinforce",
        now,
      ),
    ).toMatch(/^Borers now /);
    expect(
      fittedEffect({ ...createMountain(), borers: 1 }, "reinforce", now),
    ).toMatch(/^Great Machine now /);
  });
});

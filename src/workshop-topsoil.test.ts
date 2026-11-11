import { describe, expect, it } from "vitest";
import { LAYERS, materialsFromMined } from "./layers";
import type { Mountain } from "./mountain";
import { minedMountain } from "./test-fixtures";
import {
  TOPSOIL_BENCH_FROM,
  fullWorkshop,
  recipeOpen,
  recipesForMined,
  startCraft,
  workshopUnlocked,
} from "./workshop";
import { workshopCards } from "./workshop-sheet";

/** A Topsoil dad with the clay his digging gave him. */
function topsoil(mined: number): Mountain {
  return {
    ...minedMountain(mined),
    pocket: 300_000,
    materials: materialsFromMined(mined),
    recipes: recipesForMined(mined),
  };
}

describe("Blasting charge from clay in the Topsoil (#244)", () => {
  it("opens the bench when the first charge's clay is dug", () => {
    expect(TOPSOIL_BENCH_FROM).toBe(4_000_000);
    expect(TOPSOIL_BENCH_FROM).toBeLessThan(LAYERS[1].from);
    expect(workshopUnlocked(topsoil(TOPSOIL_BENCH_FROM - 1))).toBe(false);
    const open = topsoil(TOPSOIL_BENCH_FROM);
    expect(workshopUnlocked(open)).toBe(true);
    expect(fullWorkshop(open)).toBe(false);
    expect(open.materials.clay).toBe(4);
  });

  it("crafts the charge in the Topsoil, and nothing that needs iron", () => {
    const open = topsoil(TOPSOIL_BENCH_FROM);
    expect(recipeOpen(open, "blasting-charge")).toBe(true);
    expect(recipeOpen(open, "sturdy-props")).toBe(false);
    expect(startCraft(open, "blasting-charge", 0).bench?.recipe).toBe(
      "blasting-charge",
    );
    expect(startCraft(open, "sturdy-props", 0)).toBe(open);
  });

  it("shows the charge and one dark sketch, not the iron recipes", () => {
    const cards = workshopCards(topsoil(TOPSOIL_BENCH_FROM), 0);
    expect(
      cards.map((card) => (card.kind === "hidden" ? "sketch" : card.id)),
    ).toEqual(["blasting-charge", "sketch"]);
  });

  it("opens every recipe in the Granite", () => {
    const granite = topsoil(LAYERS[1].from);
    expect(fullWorkshop(granite)).toBe(true);
    expect(recipeOpen(granite, "sturdy-props")).toBe(true);
  });
});

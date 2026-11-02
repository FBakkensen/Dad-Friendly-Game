import { describe, expect, it } from "vitest";
import { LAYERS, materialsFromMined } from "./layers";
import type { Mountain } from "./mountain";
import { minedMountain } from "./test-fixtures";
import { markSeen, recordFirstUse } from "./teach";
import { CHARGE_MS, startCraft } from "./workshop";
import { workshopCards } from "./workshop-sheet";
import {
  FIRST_CRAFT,
  firstCraftLabel,
  teachFirst,
  workshopTeach,
} from "./workshop-teach";

const GRANITE = LAYERS[1].from;

/** The dad the day the Workshop opens: every clay the Topsoil gave, a crew. */
function opening(): Mountain {
  return {
    ...minedMountain(GRANITE),
    pocket: 400_000,
    helpers: 40,
    materials: materialsFromMined(GRANITE),
  };
}

describe("Workshop first visit (#243)", () => {
  it("names the real price on the big button", () => {
    expect(firstCraftLabel(FIRST_CRAFT)).toBe(
      "Craft Blasting charge · 4 clay · 100K",
    );
  });

  it("can pay for the first craft the moment the Workshop opens", () => {
    const at = opening();
    expect(at.materials?.clay).toBe(10);
    expect(startCraft(at, FIRST_CRAFT, 0).bench?.recipe).toBe(FIRST_CRAFT);
    const card = workshopCards(at, 0).find(
      (item) => item.kind === "recipe" && item.id === FIRST_CRAFT,
    );
    expect(card?.kind === "recipe" && card.action.kind).toBe("craft");
  });

  it("shows the intro and puts the New card first until the first craft", () => {
    const mountain = markSeen(opening(), "workshop");
    const teach = workshopTeach(mountain, 0);
    expect(teach.intro).toBe("Turn your clay into gear for the crew.");
    expect(teach.newCard).toBe(FIRST_CRAFT);
    const first = teachFirst(workshopCards(mountain, 0), teach)[0];
    expect(first?.kind === "recipe" && first.id).toBe(FIRST_CRAFT);
    expect(teach.payoff).toBeUndefined();
  });

  it("swaps the tag for the payoff once the first charge is working", () => {
    const crafted = recordFirstUse(startCraft(opening(), FIRST_CRAFT, 1_000));
    const teach = workshopTeach(crafted, 2_000);
    expect(teach.intro).toBeUndefined();
    expect(teach.newCard).toBeUndefined();
    expect(teach.payoff?.id).toBe(FIRST_CRAFT);
    expect(teach.payoff?.text).toMatch(/^\+[\d,]+\/s now$/);
    const first = teachFirst(workshopCards(crafted, 2_000), teach)[0];
    expect(first?.kind === "recipe" && first.id).toBe(FIRST_CRAFT);
  });

  it("goes quiet once the first charge has run out", () => {
    const crafted = recordFirstUse(startCraft(opening(), FIRST_CRAFT, 1_000));
    expect(workshopTeach(crafted, 1_000 + CHARGE_MS + 1)).toEqual({});
  });

  it("leaves the order alone when nothing is taught", () => {
    const cards = workshopCards(opening(), 0);
    expect(teachFirst(cards, {})).toBe(cards);
  });
});

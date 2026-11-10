// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cardUp, showCard } from "./card-state";

describe("card state", () => {
  it("a card never shown is not up", () => {
    expect(cardUp(document.createElement("div"))).toBe(false);
  });

  it("showCard records and hides", () => {
    const el = document.createElement("div");
    showCard(el, true);
    expect(cardUp(el)).toBe(true);
    expect(el.hidden).toBe(false);
    showCard(el, false);
    expect(cardUp(el)).toBe(false);
    expect(el.hidden).toBe(true);
  });

  it("the record is the card's own", () => {
    const shown = document.createElement("div");
    const other = document.createElement("div");
    showCard(shown, true);
    expect(cardUp(other)).toBe(false);
  });
});

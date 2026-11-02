import { describe, expect, it } from "vitest";
import { BOOSTS } from "./boosts";
import { PROMOTE_BASE_COST, TENDED_MACHINE_STAFF } from "./engineers";
import { formatCompact } from "./format";
import { HOW_IT_WORKS, HOW_SYSTEMS } from "./how-it-works";
import { tierById } from "./tiers";

const all = HOW_SYSTEMS.map((id) => HOW_IT_WORKS[id]);
const words = (id: (typeof HOW_SYSTEMS)[number]): string =>
  HOW_IT_WORKS[id].steps.map(([, text]) => text).join(" ");

/** Longest line that still fits two rows on a 412px phone. */
const MAX_LINE = 96;

describe("How it works copy", () => {
  it("covers every system in #242", () => {
    expect(Object.keys(HOW_IT_WORKS).sort()).toEqual([...HOW_SYSTEMS].sort());
  });

  it("never asks a question", () => {
    for (const item of all) {
      for (const text of [
        item.title,
        item.reveal,
        ...item.steps.map(([, t]) => t),
      ]) {
        expect(text).not.toContain("?");
      }
    }
  });

  it("fits on one screen: 3 or 4 short lines and a one-line reveal", () => {
    for (const item of all) {
      expect(item.steps.length).toBeGreaterThanOrEqual(3);
      expect(item.steps.length).toBeLessThanOrEqual(4);
      expect(item.reveal.length).toBeLessThanOrEqual(56);
      expect(item.title.length).toBeLessThanOrEqual(24);
      for (const [, text] of item.steps) {
        expect(text.length, text).toBeLessThanOrEqual(MAX_LINE);
        expect(text.trim()).toBe(text);
      }
    }
  });

  it("reads purchase and tending numbers from the game data", () => {
    const worker = tierById("helper");
    expect(words("workers")).toContain(
      `${formatCompact(worker.firstCost)} stones`,
    );
    expect(words("machines")).toContain(
      `${formatCompact(tierById("cart").firstCost)} stones`,
    );
    expect(words("engineers")).toContain(formatCompact(PROMOTE_BASE_COST));
    expect(words("tending")).toContain(String(TENDED_MACHINE_STAFF));
    for (const boost of BOOSTS) {
      expect(words("boosts")).toContain(boost.effect);
    }
  });

  it("keeps discoveries vague", () => {
    for (const id of ["relics", "recipes", "veins"] as const) {
      expect(words(id)).not.toMatch(/\d+\s*%|×\d/);
    }
  });

  it("never prints payback or time-to-afford", () => {
    for (const item of all) {
      const text = item.steps
        .map(([, t]) => t)
        .join(" ")
        .toLowerCase();
      expect(text).not.toMatch(
        /pays? (itself )?back|payback|afford|best value/,
      );
    }
  });
});

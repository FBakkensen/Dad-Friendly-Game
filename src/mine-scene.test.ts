import { describe, expect, it } from "vitest";
import { alignDeepest } from "./mine-scene";

/** The scene's cages as drawn (#680): the top cages merge and split, the rest keep riding. */
describe("the drawn cages on a new count", () => {
  it("keeps the cages below where they are drawn when the top ones merge", () => {
    // Two cages at the top and one on its way down become one at the top.
    expect(alignDeepest([0, 0, 0.8], [0, 1])).toEqual([0, 0.8]);
  });

  it("keeps the cages below where they are drawn when one leaves the top", () => {
    expect(alignDeepest([0, 1.4], [0, 0.1, 1.5])).toEqual([0, 0, 1.4]);
  });

  it("puts every cage at once when none is drawn yet", () => {
    expect(alignDeepest([], [0, 1, 2])).toEqual([0, 1, 2]);
  });
});

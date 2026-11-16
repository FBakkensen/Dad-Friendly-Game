import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF, freshMineOn } from "./line-switch";
import { PART_TWO_OFF, PLAY_FACTORS, partTwoOn } from "./part-switch";

describe("part switch", () => {
  it("PLAY_FACTORS holds the fresh mine with part 2", () => {
    expect(PLAY_FACTORS).toEqual({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 });
    expect(
      withFactors(PLAY_FACTORS, () => [freshMineOn(), partTwoOn()]),
    ).toEqual([true, true]);
  });

  it("plays part 2 only in a fresh mine", () => {
    expect(withFactors({ [PART_TWO_OFF]: 0 }, partTwoOn)).toBe(false);
    expect(withFactors({ [FRESH_OFF]: 0 }, partTwoOn)).toBe(false);
    expect(partTwoOn()).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import {
  PART_THREE_OFF,
  PART_TWO_OFF,
  PLAY_FACTORS,
  SLICE_2_PART_1_OFF,
  partThreeOn,
  partTwoOn,
  slice2Part1On,
} from "./part-switch";

describe("part switch", () => {
  it("PLAY_FACTORS holds Slice 2 Part 1 of the fresh mine (#682, #769)", () => {
    expect(PLAY_FACTORS).toEqual({
      [PART_TWO_OFF]: 0,
      [PART_THREE_OFF]: 0,
      [SLICE_2_PART_1_OFF]: 0,
    });
    expect(withFactors(PLAY_FACTORS, partTwoOn)).toBe(true);
    expect(withFactors(PLAY_FACTORS, partThreeOn)).toBe(true);
    expect(withFactors(PLAY_FACTORS, slice2Part1On)).toBe(true);
  });

  it("plays part 2 only when its switch is set", () => {
    expect(withFactors({ [PART_TWO_OFF]: 0 }, partTwoOn)).toBe(true);
    expect(partTwoOn()).toBe(false);
  });

  it("plays part 3 only on part 2", () => {
    expect(withFactors({ [PART_THREE_OFF]: 0 }, partThreeOn)).toBe(false);
    expect(
      withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, partThreeOn),
    ).toBe(true);
  });
});

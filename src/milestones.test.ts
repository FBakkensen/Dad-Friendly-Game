import { describe, expect, it } from "vitest";
import {
  MILESTONES,
  type MilestoneTable,
  milestoneLine,
  milestoneMultiplier,
  milestonesReached,
} from "./milestones.ts";

const TABLE: MilestoneTable = {
  drill: [
    {
      at: 20,
      goal: "Twenty drills and the crew finds its rhythm. Every drill mines twice as fast.",
    },
    { at: 30, goal: "Thirty drills humming together. Twice as fast again." },
  ],
  borer: [
    {
      at: 5,
      goal: "Five borers side by side. They clear the tunnels twice as fast.",
    },
    { at: 10, goal: "Ten borers in step. Twice as fast again." },
  ],
  machine: [
    {
      at: 2,
      goal: "Two Great Machines working as one. Both run twice as fast.",
    },
    { at: 3, goal: "Three Great Machines in step. Twice as fast again." },
  ],
};

const plain = (value: number): string => String(value);

describe("owned-count milestones", () => {
  it("doubles at each mark and stacks", () => {
    expect(milestoneMultiplier("drill", 19, TABLE)).toBe(1);
    expect(milestoneMultiplier("drill", 20, TABLE)).toBe(2);
    expect(milestoneMultiplier("drill", 30, TABLE)).toBe(4);
    expect(milestoneMultiplier("borer", 5, TABLE)).toBe(2);
    expect(milestoneMultiplier("borer", 10, TABLE)).toBe(4);
    expect(milestoneMultiplier("machine", 2, TABLE)).toBe(2);
    expect(milestoneMultiplier("machine", 3, TABLE)).toBe(4);
  });

  it("ships the retune's marks (#252)", () => {
    expect(MILESTONES).toEqual(TABLE);
    expect(milestoneMultiplier("drill", 30)).toBe(4);
    expect(milestoneLine("cart", 500, plain)).toBeUndefined();
  });

  it("leaves tiers without marks alone", () => {
    expect(milestoneMultiplier("cart", 500, TABLE)).toBe(1);
    expect(milestoneMultiplier("helper", 500, TABLE)).toBe(1);
    expect(milestonesReached("kid", 500, TABLE)).toBe(0);
    expect(milestoneLine("cart", 3, plain, TABLE)).toBeUndefined();
  });

  it("names the next goal, then the reached line", () => {
    expect(milestoneLine("drill", 12, plain, TABLE)).toBe(
      "12 of 20 · Twenty drills and the crew finds its rhythm. Every drill mines twice as fast.",
    );
    expect(milestoneLine("drill", 22, plain, TABLE)).toBe(
      "Twice as fast now. 22 of 30 · Thirty drills humming together. Twice as fast again.",
    );
    expect(milestoneLine("drill", 30, plain, TABLE)).toBe("Twice as fast now.");
  });

  it("keeps marks ordered, never a question, never a payback hint", () => {
    for (const marks of Object.values({ ...MILESTONES, ...TABLE })) {
      const ats = marks.map((mark) => mark.at);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
      for (const mark of marks) {
        expect(mark.goal).not.toMatch(/[?]|payback|pays back|seconds/i);
      }
    }
  });
});

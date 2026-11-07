import { describe, expect, it } from "vitest";
import type { TierId } from "./tiers.ts";
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

  it("every staffed tier has the spec marks", () => {
    const ats = (id: TierId) => MILESTONES[id]?.map((mark) => mark.at);
    for (const id of ["cart", "drill"] as const) {
      expect(ats(id)).toEqual([10, 25, 50, 100, 150, 200]);
    }
    // Flemming's ruling after the Task 3 stop (#357): borers keep their 5.
    expect(ats("borer")).toEqual([5, 10, 25, 50, 100, 150, 200]);
    expect(ats("machine")).toEqual([2, 3, 5, 10, 25, 50]);
    expect(ats("helper")).toEqual([25, 50, 100]);
    expect(MILESTONES.kid).toBeUndefined();
  });

  it("marks stack to x64 and stop", () => {
    expect(milestoneMultiplier("cart", 9)).toBe(1);
    expect(milestoneMultiplier("cart", 10)).toBe(2);
    expect(milestoneMultiplier("cart", 199)).toBe(32);
    expect(milestoneMultiplier("cart", 200)).toBe(64);
    expect(milestoneMultiplier("cart", 5000)).toBe(64);
    expect(milestoneMultiplier("helper", 100)).toBe(8);
    expect(milestoneMultiplier("helper", 1000)).toBe(8);
    expect(milestoneMultiplier("machine", 50)).toBe(64);
  });

  it("borers double from five and stop at x128", () => {
    expect(milestoneMultiplier("borer", 4)).toBe(1);
    expect(milestoneMultiplier("borer", 5)).toBe(2);
    expect(milestoneMultiplier("borer", 10)).toBe(4);
    expect(milestoneMultiplier("borer", 199)).toBe(64);
    expect(milestoneMultiplier("borer", 200)).toBe(128);
    expect(milestoneMultiplier("borer", 5000)).toBe(128);
    expect(milestoneLine("borer", 3, plain)).toBe(
      "3 of 5 · Five borers side by side. They clear the tunnels twice as fast.",
    );
    expect(milestoneLine("borer", 7, plain)).toBe(
      "Twice as fast now. 7 of 10 · Ten borers in step. Twice as fast again.",
    );
  });

  it("goal lines fit a phone card", () => {
    for (const marks of Object.values(MILESTONES)) {
      for (const mark of marks) {
        expect(mark.goal.length).toBeLessThanOrEqual(80);
        expect(mark.goal.endsWith(".")).toBe(true);
      }
    }
  });

  it("past the last mark the card says twice as fast now", () => {
    expect(milestoneLine("cart", 200, String)).toBe("Twice as fast now.");
  });

  it("leaves tiers without marks alone", () => {
    expect(milestoneMultiplier("kid", 500)).toBe(1);
    expect(milestoneMultiplier("cart", 500, TABLE)).toBe(1);
    expect(milestoneMultiplier("helper", 500, TABLE)).toBe(1);
    expect(milestonesReached("kid", 500, TABLE)).toBe(0);
    expect(milestoneLine("kid", 500, plain)).toBeUndefined();
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

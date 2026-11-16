import { describe, expect, it } from "vitest";
import { withFactors } from "../economy/factors";
import { FRESH_OFF } from "../line-switch";
import { createMountain } from "../mountain";
import casual from "./fresh-policies/casual-2x10";
import { freshPolicy } from "./plain";
import { fixDelayMs } from "./policy";
import { NOT_FRESH, runDone, runPolicy } from "./run";
import { FIX_FAST_MS, FIX_SLOW_MS, MS_PER_SECOND } from "./targets";

describe("a fresh mine's run (#655)", () => {
  const FRESH = { [FRESH_OFF]: 0 };

  it("ends when the last building built so far stands", () => {
    withFactors(FRESH, () => {
      const start = createMountain();
      expect(runDone(start)).toBe(false);
      expect(runDone({ ...start, operational: ["lightTower"] })).toBe(true);
    });
  });

  it("throws when the caller forgot the fresh mine's factors", () => {
    expect(() =>
      runPolicy({ policy: casual, seed: 1, maxLiveSeconds: 1 }),
    ).toThrow(NOT_FRESH);
  });

  it("plays part 1's dad: he orders in his first second", () => {
    withFactors(FRESH, () => {
      const run = runPolicy({ policy: casual, seed: 1, maxLiveSeconds: 1 });
      expect(run.world.mountain.project.kind).not.toBe("unordered");
    });
  });

  it("stops when the caller says the second is enough", () => {
    withFactors(FRESH, () => {
      const run = runPolicy({
        policy: casual,
        seed: 1,
        maxLiveSeconds: 10,
        until: (world) => world.clock >= 2 * MS_PER_SECOND,
      });
      expect(run.world.clock).toBe(2 * MS_PER_SECOND);
    });
  });

  it("does not pay the gap once the live seconds are used up", () => {
    const brief = freshPolicy({
      id: "brief",
      label: "One minute",
      kind: "extreme",
      sessionsPerDay: 2,
      minutesPerSession: 1,
      moves: "once",
    });
    withFactors(FRESH, () => {
      const run = runPolicy({ policy: brief, seed: 1, maxLiveSeconds: 60 });
      expect(run.world.clock).toBe(60 * MS_PER_SECOND);
    });
  });
});

describe("fixing trouble", () => {
  it("waits the dad's delay, or never fixes", () => {
    expect(fixDelayMs("fast")).toBe(FIX_FAST_MS);
    expect(fixDelayMs("slow")).toBe(FIX_SLOW_MS);
    expect(fixDelayMs("never")).toBeUndefined();
  });
});

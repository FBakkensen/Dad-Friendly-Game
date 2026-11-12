import { describe, expect, it } from "vitest";
import type { Mountain } from "./mountain";
import type { TierId } from "./tiers";
import {
  GRANDPA_RANK,
  TENDING_GAIN,
  TENDING_TENTHS,
  grandpaPost,
  tendingTenths,
} from "./engineers";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";

/** Grandpa's post as the crew is staffed now. */
function postOf(mountain: Mountain): TierId | undefined {
  return grandpaPost(mountain, effectiveRates(mountain).running);
}

/** A tier's tending tenths as the crew is staffed now. */
function tenthsOf(mountain: Mountain, tierId: TierId): number {
  return tendingTenths(mountain, tierId, effectiveRates(mountain).running);
}

const kidRun = { ...minedMountain(1_000), legacy: 1, helpers: 4, carts: 2 };

describe("grandpa (#338)", () => {
  it("is only on the crew after a pass, and only with a machine to tend", () => {
    expect(postOf({ ...kidRun, legacy: 0 })).toBeUndefined();
    expect(postOf({ ...kidRun, carts: 0 })).toBeUndefined();
    expect(postOf(kidRun)).toBe("cart");
  });

  it("never moves to a machine short of workers, so a buy never slows the crew", () => {
    // Two workers run the carts; a borer (8) and a Great Machine (25) idle.
    const small = { ...kidRun, helpers: 2, carts: 2 };
    expect(postOf(small)).toBe("cart");
    const idle = { ...small, borers: 1, machines: 1 };
    expect(postOf(idle)).toBe("cart");
    expect(effectiveRates(idle).crewPerSecond).toBeGreaterThanOrEqual(
      effectiveRates(small).crewPerSecond,
    );
  });

  it("tends the biggest running machine no engineer is tending", () => {
    const deep = { ...kidRun, helpers: 40, drills: 1, borers: 1 };
    expect(postOf(deep)).toBe("borer");
    const borerTended = {
      ...deep,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }] as const,
    };
    expect(postOf(borerTended)).toBe("drill");
    expect(postOf({ ...deep, helpers: 80, machines: 1 })).toBe("machine");
  });

  it("tends at his rank on his post, and adds nothing elsewhere", () => {
    const tends = TENDING_TENTHS[GRANDPA_RANK] * TENDING_GAIN;
    expect(tenthsOf(kidRun, "cart")).toBeCloseTo(tends);
    expect(tenthsOf(kidRun, "drill")).toBe(0);
    expect(tenthsOf({ ...kidRun, legacy: 0 }, "cart")).toBe(0);
    const before = effectiveRates({ ...kidRun, legacy: 0 }).tierSpeed.cart;
    const after = effectiveRates(kidRun).tierSpeed.cart;
    // Legacy ×1.5 and his tending, nothing more.
    expect(after).toBeCloseTo(before * 1.5 * (1 + tends / 10));
  });

  it("tends his biggest group by base output, not the newest machine (#356)", () => {
    const many = { ...kidRun, helpers: 400, drills: 60, borers: 1 };
    expect(postOf(many)).toBe("drill");
    expect(postOf({ ...many, borers: 10 })).toBe("borer");
    const drillsTended = {
      ...many,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "drill" }] as const,
    };
    expect(postOf(drillsTended)).toBe("borer");
    expect(postOf({ ...many, legacy: 0 })).toBeUndefined();
  });

  it("takes the higher tier when two groups put out the same (#356)", () => {
    // Six carts at 6/s and one drill at 36/s: a tie goes to the drill.
    const tie = { ...kidRun, helpers: 7, carts: 6, drills: 1 };
    expect(postOf(tie)).toBe("drill");
  });

  it("a first borer never lowers the crew's income (#356)", () => {
    const drills = { ...kidRun, helpers: 400, drills: 60 };
    const bought = { ...drills, borers: 1 };
    expect(effectiveRates(bought).crewPerSecond).toBeGreaterThanOrEqual(
      effectiveRates(drills).crewPerSecond,
    );
  });
});

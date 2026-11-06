import { describe, expect, it } from "vitest";
import { TENDING_GAIN, TENDING_TENTHS, tendingTenths } from "./engineers";
import { GRANDPA_RANK, grandpaPost } from "./grandpa";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";

const kidRun = { ...minedMountain(1_000), legacy: 1, helpers: 4, carts: 2 };

describe("grandpa (#338)", () => {
  it("is only on the crew after a pass, and only with a machine to tend", () => {
    expect(grandpaPost({ ...kidRun, legacy: 0 })).toBeUndefined();
    expect(grandpaPost({ ...kidRun, carts: 0 })).toBeUndefined();
    expect(grandpaPost(kidRun)).toBe("cart");
  });

  it("tends the biggest machine no engineer is tending", () => {
    const deep = { ...kidRun, drills: 1, borers: 1 };
    expect(grandpaPost(deep)).toBe("borer");
    const borerTended = {
      ...deep,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }] as const,
    };
    expect(grandpaPost(borerTended)).toBe("drill");
    expect(grandpaPost({ ...deep, machines: 1 })).toBe("machine");
  });

  it("tends at his rank on his post, and adds nothing elsewhere", () => {
    const tends = TENDING_TENTHS[GRANDPA_RANK] * TENDING_GAIN;
    expect(tendingTenths(kidRun, "cart")).toBeCloseTo(tends);
    expect(tendingTenths(kidRun, "drill")).toBe(0);
    expect(tendingTenths({ ...kidRun, legacy: 0 }, "cart")).toBe(0);
    const before = effectiveRates({ ...kidRun, legacy: 0 }).tierSpeed.cart;
    const after = effectiveRates(kidRun).tierSpeed.cart;
    // Legacy ×1.5 and his tending, nothing more.
    expect(after).toBeCloseTo(before * 1.5 * (1 + tends / 10));
  });
});

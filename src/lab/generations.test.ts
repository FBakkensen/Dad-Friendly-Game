import { describe, expect, it } from "vitest";
import casual from "./policies/casual-2x10";
import {
  MACHINE_IDS,
  eachRunLonger,
  linearModelDays,
  rootModelDays,
  runGenerations,
} from "./generations";
import { kidStretch } from "../scale";

describe("generations lab (M13, #253)", () => {
  it("plays kid runs back to back on the game's stretch", () => {
    const runs = runGenerations({ policy: casual, seed: 1, runs: 2 });
    expect(runs.map((run) => run.run)).toEqual([1, 2]);
    expect(runs.map((run) => run.k)).toEqual([1, kidStretch(1)]);
    expect(runs[0]?.finishDay).toBe(6);
    expect(runs[1]?.finishDay).toBeGreaterThan(6);
    expect(runs[0]?.unbought).toEqual([]);
    expect(MACHINE_IDS).toContain("borer");
  }, 60_000);

  it("stops when a run never reaches the bottom", () => {
    const runs = runGenerations({
      policy: casual,
      seed: 1,
      runs: 2,
      maxDays: 1,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.finishDay).toBeUndefined();
    expect(runs[0]?.unbought.length).toBeGreaterThan(0);
  });

  it("checks each run is longer than the last", () => {
    expect(eachRunLonger([5.5, 6, 6.5])).toBe(true);
    expect(eachRunLonger([5.5, 4.5])).toBe(false);
    expect(eachRunLonger([5.5, undefined])).toBe(false);
    expect(eachRunLonger([undefined])).toBe(false);
  });

  it("judges every type by the same rule: each run longer", () => {
    expect(eachRunLonger([7, 8, 9])).toBe(true);
    expect(eachRunLonger([7, 8, 8])).toBe(false);
  });

  it("models a run stretched by k over the bonus", () => {
    expect(linearModelDays(5.5, 3, 1.5)).toBe(11);
    expect(rootModelDays(5.5, 4, 1)).toBe(11);
  });
});

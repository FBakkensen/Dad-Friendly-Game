// Long economy sims: the sim project (npm run gate -- full), not the fast tier.
import { describe, expect, it } from "vitest";
import casual from "./policies/casual-2x10";
import { MACHINE_IDS, runGenerations } from "./generations";
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
});

import { describe, expect, it } from "vitest";
import type { Knob } from "./knobs";
import { renderSweep } from "./report";
import { sweepModel } from "./sweep";

function knob(id: string): Knob {
  return {
    id,
    label: id.toUpperCase(),
    factor: id,
    group: "price",
    low: 0,
    high: 1,
  };
}

const outputs = [{ id: "y", label: "Response", unit: "units" }] as const;

describe("sweep model", () => {
  it("replays the same seed, and a different seed moves the design", () => {
    const request = {
      knobs: [knob("a"), knob("b"), knob("c")],
      outputs,
      evaluate: (multipliers: Readonly<Record<string, number>>) => [
        (multipliers.a ?? 0) +
          0.25 * (multipliers.b ?? 0) * (multipliers.c ?? 0),
      ],
      seed: 4,
      trajectories: 6,
      samples: 64,
      top: 2,
    };
    const once = sweepModel(request);
    const twice = sweepModel(request);
    expect(twice).toEqual(once);
    expect(sweepModel({ ...request, seed: 5 })).not.toEqual(once);
    expect(once.morrisEvaluations).toBe(6 * 4);
    expect(once.sobolEvaluations).toBe(64 * (2 + 2));
    expect(once.kept).toHaveLength(2);
  });

  it("keeps the knob that moves the measure and drops the flat one", () => {
    const result = sweepModel({
      knobs: [knob("flat"), knob("live")],
      outputs,
      evaluate: (multipliers) => [4 * (multipliers.live ?? 0)],
      seed: 2,
      trajectories: 8,
      samples: 128,
      top: 1,
    });
    expect(result.morris[0]?.id).toBe("live");
    expect(result.kept).toEqual(["live"]);
    expect(result.sobol[0]?.s1[0]).toBeCloseTo(1, 1);
    expect(result.sobol[0]?.st[0]).toBeCloseTo(1, 1);
  });

  it("breaks a tie by knob id", () => {
    const result = sweepModel({
      knobs: [knob("zeta"), knob("alpha")],
      outputs,
      evaluate: () => [1],
      seed: 1,
      trajectories: 3,
      samples: 4,
      top: 2,
    });
    expect(result.morris.map((row) => row.id)).toEqual(["alpha", "zeta"]);
    expect(result.morris.every((row) => row.score === 0)).toBe(true);
  });

  it("writes S1 and ST tables", () => {
    const knobs = [knob("a"), knob("b")];
    const result = sweepModel({
      knobs,
      outputs,
      evaluate: (multipliers) => [multipliers.a ?? 0],
      seed: 1,
      trajectories: 4,
      samples: 16,
      top: 1,
    });
    const markdown = renderSweep({
      policyId: "casual-2x10",
      days: 30,
      knobs,
      result,
    });
    expect(markdown).toContain("## Sobol — Response (units)");
    expect(markdown).toContain("| Knob | S1 | ST |");
    expect(markdown).toContain("casual-2x10");
    expect(markdown).toContain("## Morris screening");
  });
});

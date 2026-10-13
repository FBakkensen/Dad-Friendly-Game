import { describe, expect, it } from "vitest";
import { scrambledSobol, sobolIndices, sobolPoint } from "./sobol";

/** First 10 Joe–Kuo points in 3 dimensions, Gray-code order, including the origin. */
const JOE_KUO_3D: readonly (readonly number[])[] = [
  [0, 0, 0],
  [0.5, 0.5, 0.5],
  [0.75, 0.25, 0.25],
  [0.25, 0.75, 0.75],
  [0.375, 0.375, 0.625],
  [0.875, 0.875, 0.125],
  [0.625, 0.125, 0.875],
  [0.125, 0.625, 0.375],
  [0.1875, 0.3125, 0.9375],
  [0.6875, 0.8125, 0.4375],
];

function ishigami(unit: readonly number[]): number {
  const x1 = -Math.PI + 2 * Math.PI * (unit[0] ?? 0);
  const x2 = -Math.PI + 2 * Math.PI * (unit[1] ?? 0);
  const x3 = -Math.PI + 2 * Math.PI * (unit[2] ?? 0);
  const amplitude = 7;
  const bend = 0.1;
  return (
    Math.sin(x1) + amplitude * Math.sin(x2) ** 2 + bend * x3 ** 4 * Math.sin(x1)
  );
}

/** Closed form from Saltelli's Ishigami example, a = 7, b = 0.1. */
function ishigamiTruth(): {
  readonly s1: readonly number[];
  readonly st: readonly number[];
} {
  const amplitude = 7;
  const bend = 0.1;
  const pi4 = Math.PI ** 4;
  const pi8 = Math.PI ** 8;
  const variance =
    (amplitude * amplitude) / 8 +
    (bend * pi4) / 5 +
    (bend * bend * pi8) / 18 +
    0.5;
  const first = (bend * pi4) / 5 + (bend * bend * pi8) / 50 + 0.5;
  const second = (amplitude * amplitude) / 8;
  const interaction = (bend * bend * pi8) / 18 - (bend * bend * pi8) / 50;
  return {
    s1: [first / variance, second / variance, 0],
    st: [
      (first + interaction) / variance,
      second / variance,
      interaction / variance,
    ],
  };
}

describe("Sobol sequence", () => {
  it("matches the Joe–Kuo points", () => {
    JOE_KUO_3D.forEach((point, index) => {
      const got = sobolPoint(index, 3);
      point.forEach((coordinate, dimension) => {
        expect(got[dimension]).toBeCloseTo(coordinate, 10);
      });
    });
  });

  it("replays a scrambled sequence from the seed", () => {
    const once = Array.from({ length: 8 }, (_, index) =>
      scrambledSobol(index, 4, 5),
    );
    const twice = Array.from({ length: 8 }, (_, index) =>
      scrambledSobol(index, 4, 5),
    );
    expect(twice).toEqual(once);
    expect(scrambledSobol(1, 4, 6)).not.toEqual(scrambledSobol(1, 4, 5));
    for (const point of once) {
      for (const coordinate of point) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThan(1);
      }
    }
  });

  it("recovers the Ishigami indices", () => {
    const truth = ishigamiTruth();
    const indices = sobolIndices({
      factors: 3,
      samples: 2048,
      seed: 1,
      evaluate: (unit) => [ishigami(unit)],
    });
    expect(indices.evaluations).toBe(2048 * (3 + 2));
    truth.s1.forEach((expected, factor) => {
      expect(indices.s1[factor]?.[0]).toBeCloseTo(expected, 1);
    });
    truth.st.forEach((expected, factor) => {
      expect(indices.st[factor]?.[0]).toBeCloseTo(expected, 1);
    });
  });
});

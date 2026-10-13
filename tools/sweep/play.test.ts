import { describe, expect, it } from "vitest";
import { defineMeasure } from "../../src/lab/measure";
import fiveMin from "../../src/lab/policies/five-min-a-day";
import { scorePolicy } from "./play";

const pocket = defineMeasure({
  id: "lastPocket",
  label: "Last pocket",
  unit: "stones",
  why: "Sees whether a knob moved the run.",
  aggregate: (samples) => samples.at(-1)?.pocket ?? 0,
});

describe("sweep play", () => {
  it("replays a run and moves it when the worker price changes", () => {
    const input = {
      policy: fiveMin,
      measures: [pocket],
      seed: 1,
      days: 1,
      multipliers: {},
    };
    const baseline = scorePolicy(input);
    expect(scorePolicy(input)).toEqual(baseline);
    const dear = scorePolicy({
      ...input,
      multipliers: { "price.helper": 8 },
    });
    expect(dear[0]).not.toBe(baseline[0]);
  });

  it("refuses a measure that is a list", () => {
    const names = defineMeasure({
      id: "names",
      label: "Names",
      unit: "list",
      why: "A list is not an index.",
      aggregate: () => ["buyTier"],
    });
    expect(() =>
      scorePolicy({
        policy: fiveMin,
        measures: [names],
        seed: 1,
        days: 1,
        multipliers: {},
      }),
    ).toThrow(/names/);
  });
});

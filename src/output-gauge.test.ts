import { describe, expect, it } from "vitest";
import {
  GAUGE_FRAMES,
  GAUGE_FULL,
  GAUGE_MAX_K,
  NEEDLE_REST,
  gaugeAngle,
  gaugeRange,
  gaugeReading,
  gaugeUnitText,
  needleFrame,
  needleKick,
  needleStep,
  type Needle,
} from "./output-gauge";

function settle(start: Needle, target: number, seconds: number) {
  let needle = start;
  let max = needle.angle;
  let min = needle.angle;
  const steps = Math.round(seconds * 60);
  const at: Needle[] = [];
  for (let i = 0; i < steps; i += 1) {
    needle = needleStep(needle, target, 1 / 60);
    max = Math.max(max, needle.angle);
    min = Math.min(min, needle.angle);
    at.push(needle);
  }
  return { needle, max, min, at };
}

describe("output gauge", () => {
  it("has the sheet's constants", () => {
    expect(GAUGE_FULL).toBe(1500);
    expect(GAUGE_MAX_K).toBe(12);
    expect(GAUGE_FRAMES).toBe(55);
  });

  it("the unit steps up so the needle never pegs", () => {
    const rates = [0, 1500, 1501, 15_000, 15_001, 1.5e15, 1e20, NaN, -5];
    expect(rates.map(gaugeRange)).toEqual([0, 0, 1, 1, 2, 12, 12, 0, 0]);
    expect(gaugeRange(Infinity)).toBe(12);
  });

  it("unit marks", () => {
    const ks = [0, 1, 2, 3, 4, 7, 10, 12];
    expect(ks.map(gaugeUnitText)).toEqual([
      "×100",
      "×1000",
      "×10K",
      "×100K",
      "×1M",
      "×1B",
      "×1T",
      "×100T",
    ]);
  });

  it("the needle's angle", () => {
    expect(gaugeAngle(0, 0)).toBe(-135);
    expect(gaugeAngle(750, 0)).toBe(0);
    expect(gaugeAngle(1500, 0)).toBe(135);
    expect(gaugeAngle(974, 0)).toBeCloseTo(40.32, 2);
    expect(gaugeAngle(1e20, 12)).toBe(135);
    expect(gaugeAngle(NaN, 0)).toBe(-135);
  });

  it("5° frames", () => {
    const angles = [-135, 0, 135, 138, 2.4, 2.6];
    expect(angles.map(needleFrame)).toEqual([0, 27, 54, 54, 27, 28]);
  });

  it("a damped needle settles", () => {
    const run = settle(NEEDLE_REST, 0, 3);
    const first = settle(NEEDLE_REST, 0, 1);
    expect(first.max).toBeLessThanOrEqual(20);
    expect(Math.abs(run.needle.angle)).toBeLessThan(1);
    for (const n of run.at) {
      expect(n.angle).toBeGreaterThanOrEqual(-135);
      expect(n.angle).toBeLessThanOrEqual(138);
    }
  });

  it("a kick swings and returns", () => {
    const start = needleKick({ angle: 0, velocity: 0 }, 150);
    const run = settle(start, 0, 3);
    expect(Math.abs(run.needle.angle)).toBeLessThan(1);
    expect(run.max).toBeGreaterThan(5);
  });

  it("stops at the pins", () => {
    const high = needleStep({ angle: 137, velocity: 400 }, 135, 1 / 60);
    expect(high.angle).toBe(138);
    expect(high.velocity).toBeLessThanOrEqual(0);
    const low = needleStep({ angle: -134, velocity: -400 }, -135, 1 / 60);
    expect(low).toEqual({ angle: -135, velocity: 0 });
  });

  it("the counter reading", () => {
    const cases: [number, string][] = [
      [0, "0"],
      [974.9, "974"],
      [1000, "1K"],
      [1950, "1.9K"],
      [12_345, "12.3K"],
      [99_999, "99.9K"],
      [412_489, "412K"],
      [1_234_567, "1.2M"],
      [7.25e12, "7.2T"],
      [999.9e12, "999T"],
      [1e15, ">999T"],
      [Infinity, ">999T"],
      [NaN, "0"],
      [-3, "0"],
    ];
    for (const [rate, text] of cases) {
      expect(gaugeReading(rate), String(rate)).toBe(text);
    }
    for (let i = 0; i < 2000; i += 1) {
      const rate = Math.random() * 10 ** (Math.random() * 16);
      expect(gaugeReading(rate).length).toBeLessThanOrEqual(5);
    }
  });
});

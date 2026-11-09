import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateCounter } from "./crew-rate";

describe("createRateCounter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const counter = (reduced: boolean) => {
    const painted: (number | undefined)[] = [];
    const rate = createRateCounter({
      reduced: () => reduced,
      paint: (shown) => {
        painted.push(shown);
      },
    });
    return { rate, painted };
  };

  it("counts up in 8 steps of 60ms, then shows the live rate", () => {
    const { rate, painted } = counter(false);
    rate.count(0, 80);
    expect(painted).toEqual([0]);
    vi.advanceTimersByTime(60);
    expect(painted).toEqual([0, 10]);
    vi.advanceTimersByTime(6 * 60);
    expect(painted).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    vi.advanceTimersByTime(60);
    expect(painted).toEqual([0, 10, 20, 30, 40, 50, 60, 70, undefined]);
    // Done: nothing more is painted.
    vi.advanceTimersByTime(1_000);
    expect(painted).toHaveLength(9);
  });

  it("rounds each step", () => {
    const { rate, painted } = counter(false);
    rate.count(1, 4);
    vi.advanceTimersByTime(60);
    expect(painted).toEqual([1, Math.round(1 + 3 / 8)]);
  });

  it("skips the count under reduced motion", () => {
    const { rate, painted } = counter(true);
    rate.count(0, 80);
    vi.advanceTimersByTime(1_000);
    expect(painted).toEqual([undefined]);
  });

  it("skips the count when the rate did not grow", () => {
    const { rate, painted } = counter(false);
    rate.count(80, 80);
    vi.advanceTimersByTime(1_000);
    expect(painted).toEqual([undefined]);
  });

  it("a second count starts again from its own rate", () => {
    const { rate, painted } = counter(false);
    rate.count(0, 80);
    vi.advanceTimersByTime(60);
    rate.count(80, 160);
    expect(painted).toEqual([0, 10, 80]);
    vi.advanceTimersByTime(8 * 60);
    expect(painted).toEqual([
      0,
      10,
      80,
      90,
      100,
      110,
      120,
      130,
      140,
      150,
      undefined,
    ]);
  });
});

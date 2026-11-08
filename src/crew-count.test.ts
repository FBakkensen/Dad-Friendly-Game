import { describe, expect, it, vi } from "vitest";
import { crewCounts } from "./crew-count";
import { createMountain } from "./mountain";
import type { TierId } from "./tiers";

/** Lets one test hand crewCounts a running table the rules would never build. */
const forced = vi.hoisted(() => ({
  running: undefined as Record<string, number> | undefined,
}));

vi.mock("./rates", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const effectiveRates = real.effectiveRates as (...args: unknown[]) => {
    running: Record<TierId, number>;
  };
  return {
    ...real,
    effectiveRates: (...args: unknown[]) => {
      const rates = effectiveRates(...args);
      return forced.running === undefined
        ? rates
        : { ...rates, running: { ...rates.running, ...forced.running } };
    },
  };
});

const NOW = 1_700_000_000_000;

describe("crewCounts", () => {
  it("is all zero on a fresh mountain", () => {
    expect(crewCounts(createMountain(), NOW)).toEqual({
      crew: 0,
      spare: 0,
      free: 0,
    });
  });

  it("leaves the workers the carts do not need free", () => {
    const mountain = { ...createMountain(), helpers: 18, carts: 6 };
    expect(crewCounts(mountain, NOW)).toEqual({
      crew: 18,
      spare: 12,
      free: 12,
    });
  });

  it("has none free when the carts and drills take every worker", () => {
    const mountain = {
      ...createMountain(),
      helpers: 18,
      carts: 13,
      drills: 5,
    };
    expect(crewCounts(mountain, NOW)).toEqual({ crew: 18, spare: 0, free: 0 });
  });

  it("counts kids as crew", () => {
    const mountain = { ...createMountain(), helpers: 2, kids: 3, carts: 1 };
    expect(crewCounts(mountain, NOW)).toEqual({ crew: 5, spare: 4, free: 4 });
  });

  it("has none free on a mountain short of workers", () => {
    const mountain = { ...createMountain(), helpers: 2, carts: 6 };
    expect(crewCounts(mountain, NOW)).toEqual({ crew: 2, spare: 0, free: 0 });
  });

  it("never shows a negative spare as free", () => {
    forced.running = { cart: 6 };
    try {
      const mountain = { ...createMountain(), helpers: 2, carts: 6 };
      expect(crewCounts(mountain, NOW)).toEqual({
        crew: 2,
        spare: -4,
        free: 0,
      });
    } finally {
      forced.running = undefined;
    }
  });
});

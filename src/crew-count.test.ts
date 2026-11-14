import { describe, expect, it, vi } from "vitest";
import { crewCounts } from "./crew-count";
import { createMountain } from "./mountain";
import type { TierId } from "./tiers";

/** Lets one test hand crewCounts a needed table the rules would never build. */
const forced = vi.hoisted(() => ({
  needed: undefined as Record<string, number> | undefined,
}));

vi.mock("./rates", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const effectiveRates = real.effectiveRates as (...args: unknown[]) => {
    needed: Record<TierId, number>;
  };
  return {
    ...real,
    effectiveRates: (...args: unknown[]) => {
      const rates = effectiveRates(...args);
      return forced.needed === undefined
        ? rates
        : { ...rates, needed: { ...rates.needed, ...forced.needed } };
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
    // On the line (#536) eighteen hands dig, carry and lift 18 a second; two
    // carts free the carriers, and the other four carts move nothing, so
    // their hands count as free.
    const mountain = {
      ...createMountain(),
      owned: { ...createMountain().owned, helper: 18, cart: 6 },
    };
    expect(crewCounts(mountain, NOW)).toEqual({
      crew: 18,
      spare: 16,
      free: 16,
    });
  });

  it("has none free when the machines the line needs take every worker", () => {
    // Every cart, hoist and drill moves the line (#536): each stage needs all
    // of its machines, so every hand is taken.
    const mountain = {
      ...createMountain(),
      owned: {
        ...createMountain().owned,
        helper: 3,
        cart: 1,
        hoist: 1,
        drill: 1,
      },
    };
    expect(crewCounts(mountain, NOW)).toEqual({ crew: 3, spare: 0, free: 0 });
  });

  it("counts a hand on a machine that moves nothing as free (#536)", () => {
    // Thirteen carts and five drills with an empty lift: three carts and a
    // drill carry and dig all the hands can lift, so fifteen hands are free.
    const mountain = {
      ...createMountain(),
      owned: { ...createMountain().owned, helper: 18, cart: 13, drill: 5 },
    };
    expect(crewCounts(mountain, NOW)).toEqual({
      crew: 18,
      spare: 15,
      free: 15,
    });
  });

  it("counts kids as crew", () => {
    const mountain = {
      ...createMountain(),
      owned: { ...createMountain().owned, helper: 2, kid: 3, cart: 1 },
    };
    expect(crewCounts(mountain, NOW)).toEqual({ crew: 5, spare: 4, free: 4 });
  });

  it("has none free on a mountain short of workers", () => {
    const mountain = {
      ...createMountain(),
      owned: {
        ...createMountain().owned,
        helper: 2,
        cart: 1,
        hoist: 1,
        drill: 6,
      },
    };
    expect(crewCounts(mountain, NOW)).toEqual({ crew: 2, spare: 0, free: 0 });
  });

  it("never shows a negative spare as free", () => {
    forced.needed = { cart: 6 };
    try {
      const mountain = {
        ...createMountain(),
        owned: { ...createMountain().owned, helper: 2, cart: 6 },
      };
      expect(crewCounts(mountain, NOW)).toEqual({
        crew: 2,
        spare: -4,
        free: 0,
      });
    } finally {
      forced.needed = undefined;
    }
  });
});

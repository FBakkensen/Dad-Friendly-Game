import type { Mountain } from "./mountain";

/** Quick, timed boosts. See docs/DESIGN.md "M3: Strategy". */
export type BoostId = "sharper" | "overtime";

/** Saved as absolute end times (epoch ms), so a reload keeps the countdown. */
export type Boosts = Readonly<Partial<Record<BoostId, number>>>;

export type Boost = {
  readonly id: BoostId;
  readonly name: string;
  readonly effect: string;
  readonly durationMs: number;
  /** Multiplier while running: taps for Sharper picks, crew for Overtime. */
  readonly multiplier: number;
  /**
   * Price: this many seconds of the crew's work (Overtime) or this many taps
   * (Sharper picks), unboosted. Kept a small fraction of what the boost pays
   * back, so a boost is always worth it (src/boosts.test.ts proves it).
   */
  readonly priceIn: "crewSeconds" | "taps";
  readonly priceUnits: number;
  /** …but never less than this, so a new dad can try it. */
  readonly minCost: number;
};

const BY_ID: Readonly<Record<BoostId, Boost>> = {
  sharper: {
    id: "sharper",
    name: "Sharper picks",
    effect: "Taps mine ×2 for 10 minutes.",
    durationMs: 10 * 60 * 1000,
    multiplier: 2,
    priceIn: "taps",
    priceUnits: 60,
    minCost: 100,
  },
  overtime: {
    id: "overtime",
    name: "Overtime",
    effect: "Your crew mines ×2 for 30 minutes while you play.",
    durationMs: 30 * 60 * 1000,
    multiplier: 2,
    priceIn: "crewSeconds",
    priceUnits: 180,
    minCost: 500,
  },
};

export const BOOSTS: readonly Boost[] = Object.values(BY_ID);

export function boostById(id: BoostId): Boost {
  return BY_ID[id];
}

/** Milliseconds left on a boost, 0 when it isn't running. */
export function boostLeft(
  mountain: Mountain,
  id: BoostId,
  now: number,
): number {
  const endsAt = mountain.boosts?.[id];
  if (endsAt === undefined) {
    return 0;
  }
  // Capped at the full length, so a clock set back can't stretch a boost.
  return Math.min(boostById(id).durationMs, Math.max(0, endsAt - now));
}

/** What the price scales with: the crew's speed and one tap's yield, unboosted. */
export type BoostPricing = {
  readonly crewPerSecond: number;
  readonly tapYield: number;
};

/** Priced from the crew or the tap it boosts, so it scales with progress. */
export function boostCost(boost: Boost, pricing: BoostPricing): number {
  const per =
    boost.priceIn === "taps" ? pricing.tapYield : pricing.crewPerSecond;
  return Math.max(boost.minCost, Math.ceil(per * boost.priceUnits));
}

/** Starts a boost if it isn't already running and the pocket covers it. */
export function buyBoost({
  mountain,
  id,
  now,
  pricing,
}: {
  mountain: Mountain;
  id: BoostId;
  now: number;
  pricing: BoostPricing;
}): Mountain {
  const boost = boostById(id);
  const cost = boostCost(boost, pricing);
  if (boostLeft(mountain, id, now) > 0 || mountain.pocket < cost) {
    return mountain;
  }
  return {
    ...mountain,
    pocket: mountain.pocket - cost,
    boosts: { ...mountain.boosts, [id]: now + boost.durationMs },
  };
}

/** Untrusted save data: only known ids, whole non-negative end times. */
export function parseBoosts(value: unknown): Boosts | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const parsed: Partial<Record<BoostId, number>> = {};
  for (const [key, endsAt] of Object.entries(value)) {
    if (
      !(key in BY_ID) ||
      !Number.isSafeInteger(endsAt) ||
      (endsAt as number) < 0
    ) {
      return undefined;
    }
    parsed[key as BoostId] = endsAt as number;
  }
  return parsed;
}

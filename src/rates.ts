import type { Mountain } from "./mountain";
import { TIERS, owned, type TierId } from "./tiers";
import { boostById, boostLeft } from "./boosts";
import {
  BOOTS_SPEED_PER_LEVEL,
  STEADY_AWAY_PER_LEVEL,
  TAP_SHARE_PER_LEVEL,
  tierSynergy,
  upgradeLevel,
} from "./upgrades";

/**
 * Share of the crew's speed paid for time away (app closed or in the
 * background). Tuned by src/pacing.test.ts; the Heart of Patience may raise it.
 */
export const AWAY_PAY_RATE = 0.3;

export type Rates = {
  /** Stones one tap mines. */
  readonly tapYield: number;
  /** Stones a second one of each tier mines. */
  readonly tierSpeed: Readonly<Record<TierId, number>>;
  /** How many of each tier have the helpers to run (helpers always run). */
  readonly running: Readonly<Record<TierId, number>>;
  /** Helpers short of running every machine; 0 when all are staffed. */
  readonly helpersShort: number;
  /** The whole crew, stones a second. */
  readonly crewPerSecond: number;
  /** Share of crew speed paid for time away. */
  readonly awayPay: number;
};

/**
 * Every multiplier in one place: live ticks, away earnings, taps and the UI
 * all read from here, so they can't disagree. Pass `now` while playing so
 * running boosts count; leave it out for away time, which boosts never touch.
 */
export function effectiveRates(mountain: Mountain, now?: number): Rates {
  const boosted = (id: "sharper" | "overtime"): number =>
    now !== undefined && boostLeft(mountain, id, now) > 0
      ? boostById(id).multiplier
      : 1;
  const tierSpeed = Object.fromEntries(
    TIERS.map((tier) => [
      tier.id,
      tier.id === "helper"
        ? tier.perSecond *
          (1 + upgradeLevel(mountain, "boots") * BOOTS_SPEED_PER_LEVEL)
        : tier.perSecond,
    ]),
  ) as Record<TierId, number>;
  for (const tier of TIERS) {
    tierSpeed[tier.id] *= 1 + tierSynergy(mountain, tier.id);
  }
  // Staffing: helpers run the fastest machines first; the rest sit idle.
  // Helpers still mine by hand while they run a machine.
  const running = { helper: mountain.helpers } as Record<TierId, number>;
  let free = mountain.helpers;
  let needed = 0;
  for (const tier of [...TIERS].reverse()) {
    if (tier.staff === 0) {
      continue;
    }
    const count = owned(mountain, tier);
    running[tier.id] = Math.min(count, Math.floor(free / tier.staff));
    free -= running[tier.id] * tier.staff;
    needed += count * tier.staff;
  }
  // Whole stones a second, so what the crew line says is what gets mined.
  const baseCrew = Math.floor(
    TIERS.reduce(
      (total, tier) => total + running[tier.id] * tierSpeed[tier.id],
      0,
    ) + 1e-9,
  );
  // Tap power takes its share of the crew's own speed, before Overtime.
  const tapShare = upgradeLevel(mountain, "tap") * TAP_SHARE_PER_LEVEL;
  return {
    tapYield: (1 + Math.floor(baseCrew * tapShare)) * boosted("sharper"),
    tierSpeed,
    running,
    helpersShort: Math.max(0, needed - mountain.helpers),
    crewPerSecond: baseCrew * boosted("overtime"),
    awayPay:
      AWAY_PAY_RATE *
      (1 + upgradeLevel(mountain, "steady") * STEADY_AWAY_PER_LEVEL),
  };
}

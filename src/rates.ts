import type { Mountain } from "./mountain";
import { TIERS, owned, type TierId } from "./tiers";
import { TAP_SHARE_PER_LEVEL, upgradeLevel } from "./upgrades";

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
  /** The whole crew, stones a second. */
  readonly crewPerSecond: number;
  /** Share of crew speed paid for time away. */
  readonly awayPay: number;
};

/**
 * Every multiplier in one place: live ticks, away earnings, taps and the UI
 * all read from here, so they can't disagree.
 */
export function effectiveRates(mountain: Mountain): Rates {
  const tierSpeed = Object.fromEntries(
    TIERS.map((tier) => [tier.id, tier.perSecond]),
  ) as Record<TierId, number>;
  const crewPerSecond = TIERS.reduce(
    (total, tier) => total + owned(mountain, tier) * tierSpeed[tier.id],
    0,
  );
  const tapShare = upgradeLevel(mountain, "tap") * TAP_SHARE_PER_LEVEL;
  return {
    tapYield: 1 + Math.floor(crewPerSecond * tapShare),
    tierSpeed,
    crewPerSecond,
    awayPay: AWAY_PAY_RATE,
  };
}

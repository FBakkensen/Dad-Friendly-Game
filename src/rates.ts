import { staffNeeded, tendingTenths } from "./engineers";
import { slowedSpeed, type Trouble } from "./hazards";
import type { Mountain } from "./mountain";
import { TIERS, owned, type TierId } from "./tiers";
import { hasRelic } from "./relics";
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

/** Longest time away that pays: 8 hours, a whole day with the Shield. */
export const BASE_AWAY_CAP_MS = 8 * 60 * 60 * 1000;
export const SHIELD_AWAY_CAP_MS = 24 * 60 * 60 * 1000;

/** Heart of Patience: away pay climbs from ×1 to ×2 over this long away. */
const HEART_MAX_BONUS = 0.5;
const HEART_FULL_MS = 12 * 60 * 60 * 1000;

/** The Heart of Patience multiplier for a stretch of paid time away (×1 without the Heart). */
export function heartBonus(mountain: Mountain, paidMs: number): number {
  if (!hasRelic(mountain, "heart")) {
    return 1;
  }
  return 1 + HEART_MAX_BONUS * Math.min(1, Math.max(0, paidMs) / HEART_FULL_MS);
}

/** Each Legacy (a mountain passed to your kid) adds this to crew and tap speed. */
export const LEGACY_STEP = 0.5;

/** ×1, ×1.5, ×2, …: the kid's crew and taps. Never away pay's share. */
export function legacyBonus(mountain: Mountain): number {
  return 1 + LEGACY_STEP * (mountain.legacy ?? 0);
}

/** Crown of Wisdom: each kid helper makes every helper and kid this much faster. */
const KID_TEACH_PER_KID = 0.02;

export type Rates = {
  /** Longest stretch of time away that pays (Shield of Protection lifts it). */
  readonly awayCapMs: number;
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
export function effectiveRates(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): Rates {
  const boosted = (id: "sharper" | "overtime"): number =>
    now !== undefined && boostLeft(mountain, id, now) > 0
      ? boostById(id).multiplier
      : 1;
  const taught = 1 + mountain.kids * KID_TEACH_PER_KID;
  const tierSpeed = Object.fromEntries(
    TIERS.map((tier) => [
      tier.id,
      tier.id === "helper"
        ? tier.perSecond *
          (1 + upgradeLevel(mountain, "boots") * BOOTS_SPEED_PER_LEVEL) *
          taught
        : tier.id === "kid"
          ? tier.perSecond * taught
          : tier.perSecond,
    ]),
  ) as Record<TierId, number>;
  const legacy = legacyBonus(mountain);
  for (const tier of TIERS) {
    const sped =
      tierSpeed[tier.id] * (1 + tierSynergy(mountain, tier.id)) * legacy;
    const tenths = tendingTenths(mountain, tier.id);
    // Integer tenths so +10% of 350 is 385, not 385.00000000000006.
    const tended = tenths === 0 ? sped : (sped * (10 + tenths)) / 10;
    tierSpeed[tier.id] =
      trouble !== undefined && trouble.tier === tier.id
        ? slowedSpeed(tended, trouble.startedAt, now ?? trouble.startedAt)
        : tended;
  }
  // Staffing: helpers run the fastest machines first; the rest sit idle.
  // Helpers still mine by hand while they run a machine.
  // Kids count as staff too (Crown of Wisdom).
  const running = {
    helper: mountain.helpers,
    kid: mountain.kids,
  } as Record<TierId, number>;
  let free = mountain.helpers + mountain.kids;
  let needed = 0;
  for (const tier of [...TIERS].reverse()) {
    const staff = staffNeeded(mountain, tier);
    if (staff === 0) {
      continue;
    }
    const count = owned(mountain, tier);
    running[tier.id] = Math.min(count, Math.floor(free / staff));
    free -= running[tier.id] * staff;
    needed += count * staff;
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
    // Legacy multiplies the whole tap; its share of the crew is taken before it.
    tapYield:
      Math.floor(
        (1 + Math.floor((baseCrew / legacy) * tapShare + 1e-9)) * legacy + 1e-9,
      ) * boosted("sharper"),
    tierSpeed,
    running,
    helpersShort: Math.max(0, needed - mountain.helpers - mountain.kids),
    crewPerSecond: baseCrew * boosted("overtime"),
    awayCapMs: hasRelic(mountain, "shield")
      ? SHIELD_AWAY_CAP_MS
      : BASE_AWAY_CAP_MS,
    awayPay:
      AWAY_PAY_RATE *
      (1 + upgradeLevel(mountain, "steady") * STEADY_AWAY_PER_LEVEL),
  };
}

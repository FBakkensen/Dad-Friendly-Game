import { activeFactors, factor } from "./economy/factors";
import {
  atHome,
  onTrip,
  promote,
  engineerTenths,
  station,
  type EngineerPost,
} from "./engineers";
import { slowedSpeed, type Trouble } from "./hazards";
import { milestoneMultiplier } from "./milestones";
import { callTo } from "./expeditions";
import { lineRating } from "./line";
import { nightShiftShare } from "./city";
import { lineWork } from "./workforce";
import type { Mountain } from "./mountain";
import { TIERS, owned, tierById, type TierId } from "./tiers";
import { BOOTS_SPEED_PER_LEVEL, tierSynergy, upgradeLevel } from "./upgrades";

/**
 * Share of the crew's speed paid for time away (app closed or in the
 * background).
 */
export const AWAY_PAY_RATE = 0.3;

/**
 * Away pay slopes off the longer you are gone (#278). The first 6 hours pay
 * the full away rate, 6 to 24 hours pay 40% of it, and after a day nothing
 * more: 4 / 8 / 12 / 16 / 24 hours away pay 4 / 6.8 / 8.4 / 10 / 13.2 hours.
 */
export const AWAY_FULL_MS = 6 * 60 * 60 * 1000;
const AWAY_SLOPE_SHARE = 0.4;
export const AWAY_END_MS = 24 * 60 * 60 * 1000;
/** Paid time away, as hours at the full away rate: the slope above. */
export function paidAwayMs(awayMs: number): number {
  const gone = Math.max(0, awayMs);
  const full = Math.min(gone, AWAY_FULL_MS);
  const slope = Math.max(0, Math.min(gone, AWAY_END_MS) - AWAY_FULL_MS);
  return full + AWAY_SLOPE_SHARE * slope;
}

/** Each kid helper makes every helper and kid this much faster. */
const KID_TEACH_PER_KID = 0.02;

export type Rates = {
  /** Stones a second one of each tier mines. */
  readonly tierSpeed: Readonly<Record<TierId, number>>;
  /** How many of each tier have the helpers to run (helpers always run). */
  readonly running: Readonly<Record<TierId, number>>;
  /** Helpers short of running every machine; 0 when all are staffed. */
  readonly helpersShort: number;
  /**
   * Crew stones a second before the whole-stone floor. The difference of a
   * buy keeps a fraction (11 workers with Work boots are +1.1/s). The
   * crew line and what is mined stay on `crewPerSecond`.
   */
  readonly exactCrewPerSecond: number;
  /** The whole crew, stones a second, in whole stones. */
  readonly crewPerSecond: number;
  /** Share of crew speed paid for time away. */
  readonly awayPay: number;
};

/**
 * Crew timer multiplier: retired with the old workshop timers (#769), always 1.
 */
export function crewTimer(): number {
  return 1;
}

/**
 * Every multiplier in one place: live ticks, away earnings and the UI
 * all read from here, so they can't disagree. Pass `now` while playing so
 * running crew timers count; leave it out for away time, which they never touch.
 */
export function effectiveRates(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): Rates {
  if (now !== undefined || trouble !== undefined) {
    return readRates(mountain, now, trouble);
  }
  const factors = activeFactors();
  const kept = clocklessRates.get(mountain);
  if (kept !== undefined && kept.factors === factors) {
    return kept.rates;
  }
  const rates = readRates(mountain);
  clocklessRates.set(mountain, { factors, rates });
  return rates;
}

/**
 * Rates with no clock, kept per mountain. A mountain is never changed in
 * place, so the same object always reads the same; the scoring of one
 * decision asks about the same mountain many times (#314). A sweep's
 * factors are part of the answer, so a different map reads again.
 */
const clocklessRates = new WeakMap<
  Mountain,
  {
    readonly factors: Readonly<Record<string, number>> | undefined;
    readonly rates: Rates;
  }
>();

function readRates(mountain: Mountain, now?: number, trouble?: Trouble): Rates {
  const taught = 1 + mountain.owned.kid * KID_TEACH_PER_KID;
  const tierSpeed = Object.fromEntries(
    TIERS.map((tier) => {
      // A sweep scales the tier's own stones a second. The factor is 1 in play.
      const output =
        tier.perSecond *
        lineRating(tier.id) *
        factor(`output.${tier.id}`) *
        milestoneMultiplier(tier.id, owned(mountain, tier));
      return [
        tier.id,
        tier.id === "helper"
          ? output *
            (1 + upgradeLevel(mountain, "boots") * BOOTS_SPEED_PER_LEVEL) *
            taught
          : tier.id === "kid"
            ? output * taught
            : output,
      ];
    }),
  ) as Record<TierId, number>;
  const plain = {} as Record<TierId, number>;
  for (const tier of TIERS) {
    const sped = tierSpeed[tier.id] * (1 + tierSynergy(mountain, tier.id));
    plain[tier.id] =
      trouble !== undefined && trouble.tier === tier.id
        ? slowedSpeed(sped, trouble.startedAt, now ?? trouble.startedAt)
        : sped;
    tierSpeed[tier.id] = plain[tier.id];
  }
  const { running, exactBase, helpersShort } = workforceRun(
    mountain,
    plain,
    tierSpeed,
  );
  // Whole stones a second, so what the crew line says is what gets mined.
  const baseCrew = Math.floor(exactBase + 1e-9);
  const timer = crewTimer();
  return {
    tierSpeed,
    running,
    helpersShort,
    exactCrewPerSecond: exactBase * timer,
    crewPerSecond: baseCrew * timer,
    // A building's power lights the night (slice 1, the Light Tower: 45%).
    awayPay: nightShiftShare(mountain) ?? AWAY_PAY_RATE,
  };
}

type CrewRun = {
  readonly running: Record<TierId, number>;
  readonly exactBase: number;
  readonly helpersShort: number;
};

/**
 * A fresh mine's crew is the workforce he placed (slice 1, rule 2, #689):
 * each stage's workers run its machines or work with a tool, and the line
 * moves what its slowest stage moves. No staffing search and no spreading.
 * `helpersShort` is the workers the idle machines would take, counting only
 * a machine that would move more than its workers with tools.
 */
function workforceRun(
  mountain: Mountain,
  plain: Readonly<Record<TierId, number>>,
  tierSpeed: Record<TierId, number>,
): CrewRun {
  applyAllTenths(mountain, plain, tierSpeed);
  const work = lineWork(mountain, tierSpeed);
  return {
    running: work.running,
    exactBase: work.line,
    helpersShort: work.short,
  };
}

/**
 * An apprentice on the borer is +17.5% (seven quarters of the published
 * +10% tenth). Journeyman and master scale the same way. That keeps
 * tending about a tenth clear of the 8% bar.
 */
const BORER_TENTHS_SCALE = 7 / 4;

function tenthsFor(mountain: Mountain, tierId: TierId): number {
  return scaledTenths(tierId, engineerTenths(mountain, tierId));
}

function scaledTenths(tierId: TierId, tenths: number): number {
  return tierId === "borer" ? tenths * BORER_TENTHS_SCALE : tenths;
}

function applyAllTenths(
  mountain: Mountain,
  plain: Readonly<Record<TierId, number>>,
  tierSpeed: Record<TierId, number>,
): void {
  for (const tier of TIERS) {
    const tenths = tenthsFor(mountain, tier.id);
    // Integer tenths so +10% of 595 is 654.5, not a float dust tail.
    tierSpeed[tier.id] = (plain[tier.id] * (10 + tenths)) / 10;
  }
}

/** A machine post. Camp and a trip tend nothing. */
export type TendTier = Exclude<EngineerPost, "camp">;

/** Stones a second gained by moving one engineer to that post. */
export function moveGain(
  mountain: Mountain,
  index: number,
  post: EngineerPost,
  now?: number,
  trouble?: Trouble,
): number {
  return (
    effectiveRates(callTo(mountain, index, post), now, trouble).crewPerSecond -
    effectiveRates(mountain, now, trouble).crewPerSecond
  );
}

const GUIDED_POSTS = ["machine", "borer", "drill", "cart"] as const;

/**
 * The guided first tend (#246): the first engineer at home with a move that
 * really pays right now, to the highest kind of machine nobody tends yet.
 * Undefined when no move gains stones, so the guided button never asks for
 * a step down. In practice: a hand waiting at camp.
 */
export function firstTend(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): { readonly index: number; readonly post: TendTier } | undefined {
  const engineers = mountain.engineers;
  const home = atHome(mountain);
  for (const [index, engineer] of engineers.entries()) {
    if (onTrip(mountain, engineer.name)) {
      continue;
    }
    const post = GUIDED_POSTS.find(
      (tier) =>
        home.every((other) => other.post !== tier) &&
        moveGain(mountain, index, tier, now, trouble) >= 1,
    );
    if (post !== undefined) {
      return { index, post };
    }
  }
  return undefined;
}

const STAFFED_TIERS = ["machine", "borer", "drill", "cart"] as const;

/**
 * The first idle machine (#246): the biggest idle kind. A hired worker
 * starts free, so a hire alone starts nothing (rule 2, #689). Undefined
 * when nothing stands idle.
 */
export function firstIdleTier(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): TendTier | undefined {
  const rates = effectiveRates(mountain, now, trouble);
  return STAFFED_TIERS.find(
    (id) => owned(mountain, tierById(id)) > rates.running[id],
  );
}

/**
 * What the second engineer would add (#246): promote, then the post the
 * guided first tend would give the new hand, against the crew as it is
 * now. The worker who steps up is counted. Undefined when the promotion
 * is out of reach or would not leave the crew faster, so the guided
 * Promote never asks for a worse move.
 */
export function promotePayoff(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
):
  | {
      readonly name: string;
      readonly post: TendTier;
      readonly gain: number;
    }
  | undefined {
  const promoted = promote(mountain);
  const engineers = promoted === mountain ? undefined : promoted.engineers;
  const index = (engineers?.length ?? 0) - 1;
  const hand = engineers?.[index];
  if (hand === undefined) {
    return undefined;
  }
  const before = effectiveRates(mountain, now, trouble).crewPerSecond;
  // The new hand waits at camp, so the posts taken are the old crew's.
  for (const post of GUIDED_POSTS) {
    if (atHome(mountain).some((other) => other.post === post)) {
      continue;
    }
    const gain =
      effectiveRates(station(promoted, index, post), now, trouble)
        .crewPerSecond - before;
    if (gain >= 1) {
      return { name: hand.name, post, gain };
    }
  }
  return undefined;
}

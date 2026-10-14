import { factor } from "./economy/factors";
import {
  staffNeeded,
  station,
  tendingTenths,
  type EngineerPost,
  type EngineerRank,
} from "./engineers";
import { slowedSpeed, type Trouble } from "./hazards";
import { hardnessFactorId, hardnessOf, layerOf } from "./layers";
import {
  chargeCrewMultiplier,
  emberMachineMultiplier,
  gearMultiplier,
  temperCrewMultiplier,
} from "./workshop";
import { tapWithPick } from "./lost-tools";
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

/**
 * One absence longer than half a day, before the Shield, pays this long.
 * Two gaps inside a day stay on the 8-hour cap. #179.
 */
const LONG_DAY_MARK_MS = 12 * 60 * 60 * 1000;
const LONG_DAY_CAP_MS = 16 * 60 * 60 * 1000;

/**
 * Paid time away. The Shield's cap wins. Otherwise a short gap pays at most
 * 8 hours, and a single long absence pays up to 16.
 */
export function paidAwayMs(mountain: Mountain, awayMs: number): number {
  const gone = Math.max(0, awayMs);
  const cap = hasRelic(mountain, "shield")
    ? SHIELD_AWAY_CAP_MS
    : BASE_AWAY_CAP_MS;
  if (cap === BASE_AWAY_CAP_MS && gone > LONG_DAY_MARK_MS) {
    return Math.min(gone, LONG_DAY_CAP_MS);
  }
  return Math.min(gone, cap);
}

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

/**
 * An apprentice tending a running machine is at least this percent of the
 * crew. Journeyman and Master raise it. The tier's own tenths still win
 * when they are already larger, so a Great Machine she stands on is not
 * paid twice. #178.
 */
const TENDING_FLOOR_PERCENT = [12, 16, 20] as const;

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
  /**
   * Crew stones a second before the whole-stone floor. The difference of a
   * buy keeps a fraction (11 workers with Better boots are +1.1/s). The
   * crew line and what is mined stay on `crewPerSecond`.
   */
  readonly exactCrewPerSecond: number;
  /** The whole crew, stones a second, in whole stones. */
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
  const layer = layerOf(mountain);
  const tierSpeed = Object.fromEntries(
    TIERS.map((tier) => {
      // A sweep scales the tier's own stones a second, and the rock of this
      // layer. Both factors are 1 in play.
      const ember =
        tier.id === "machine" ? emberMachineMultiplier(mountain, now) : 1;
      const output =
        tier.perSecond *
        factor(`output.${tier.id}`) *
        factor(hardnessFactorId(layer.index, tier.id)) *
        hardnessOf(layer.index, tier.id) *
        gearMultiplier(mountain, tier.id) *
        ember;
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
  const legacy = legacyBonus(mountain);
  const plain = {} as Record<TierId, number>;
  for (const tier of TIERS) {
    const sped =
      tierSpeed[tier.id] * (1 + tierSynergy(mountain, tier.id)) * legacy;
    plain[tier.id] =
      trouble !== undefined && trouble.tier === tier.id
        ? slowedSpeed(sped, trouble.startedAt, now ?? trouble.startedAt)
        : sped;
    tierSpeed[tier.id] = plain[tier.id];
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
  applyTendingFloor(mountain, plain, tierSpeed, running);
  const exactBase = TIERS.reduce(
    (total, tier) => total + running[tier.id] * tierSpeed[tier.id],
    0,
  );
  // Whole stones a second, so what the crew line says is what gets mined.
  const baseCrew = Math.floor(exactBase + 1e-9);
  // Tap power takes its share of the crew's own speed, before Overtime.
  const tapShare = upgradeLevel(mountain, "tap") * TAP_SHARE_PER_LEVEL;
  // Legacy multiplies the whole tap; its share of the crew is taken before it.
  // Grandfather's pick strengthens that bare tap; Sharper picks still doubles the result.
  const bareTap = Math.floor(
    (1 + Math.floor((baseCrew / legacy) * tapShare + 1e-9)) * legacy + 1e-9,
  );
  const charge = chargeCrewMultiplier(mountain, now);
  const temper = temperCrewMultiplier(mountain);
  return {
    tapYield: tapWithPick(bareTap, mountain) * boosted("sharper"),
    tierSpeed,
    running,
    helpersShort: Math.max(0, needed - mountain.helpers - mountain.kids),
    exactCrewPerSecond: exactBase * boosted("overtime") * charge * temper,
    crewPerSecond: baseCrew * boosted("overtime") * charge * temper,
    awayCapMs: hasRelic(mountain, "shield")
      ? SHIELD_AWAY_CAP_MS
      : BASE_AWAY_CAP_MS,
    awayPay:
      AWAY_PAY_RATE *
      (1 + upgradeLevel(mountain, "steady") * STEADY_AWAY_PER_LEVEL),
  };
}

/**
 * Tops the best running tender up to `TENDING_FLOOR_PERCENT` of the untended
 * crew when their tier bonus is smaller than that. A second post keeps its
 * own tenths on top, so two engineers are not the same button. When the
 * tier bonus is already larger, speeds stay on today's tenths.
 */
function applyTendingFloor(
  mountain: Mountain,
  plain: Readonly<Record<TierId, number>>,
  tierSpeed: Record<TierId, number>,
  running: Readonly<Record<TierId, number>>,
): void {
  const primary = primaryTender(mountain, plain, running);
  if (primary === undefined) {
    applyAllTenths(mountain, plain, tierSpeed);
    return;
  }
  const scale = factor("tending.gain");
  const plainTotal = outputOf(plain, running);
  const floorStones =
    (plainTotal * TENDING_FLOOR_PERCENT[primary.rank] * scale) / 100;
  const tenths = tenthsFor(mountain, primary.post);
  const primaryBonus =
    running[primary.post] * plain[primary.post] * (tenths / 10);
  // Before the Great Machine, today's tenths keep the checker on day 5.
  // Standing on the machine already pays its own tenth.
  if (
    mountain.machines < 1 ||
    primary.post === "machine" ||
    primaryBonus >= floorStones
  ) {
    applyAllTenths(mountain, plain, tierSpeed);
    addExtraPosts(mountain, plain, tierSpeed, running, primary.post, scale);
    return;
  }
  for (const tier of TIERS) {
    if (tier.id === primary.post) {
      continue;
    }
    const extra = tenthsFor(mountain, tier.id);
    tierSpeed[tier.id] = (plain[tier.id] * (10 + extra)) / 10;
  }
  const secondaryBonus = outputOf(tierSpeed, running) - plainTotal;
  const add = floorStones + secondaryBonus;
  tierSpeed[primary.post] = plain[primary.post] + add / running[primary.post];
  addExtraPosts(mountain, plain, tierSpeed, running, primary.post, scale);
}

/** Each other running post adds its own floor, so a second engineer pays. */
function addExtraPosts(
  mountain: Mountain,
  plain: Readonly<Record<TierId, number>>,
  tierSpeed: Record<TierId, number>,
  running: Readonly<Record<TierId, number>>,
  primaryPost: TierId,
  scale: number,
): void {
  const plainTotal = outputOf(plain, running);
  const seen = new Set<TierId>();
  const crew = mountain.engineers;
  /* v8 ignore next 3 -- a posted tender means the crew is present */
  if (crew === undefined) {
    return;
  }
  for (const engineer of crew) {
    const post = engineer.post;
    if (
      post === "camp" ||
      post === "tunnel" ||
      post === primaryPost ||
      seen.has(post) ||
      running[post] <= 0
    ) {
      continue;
    }
    seen.add(post);
    const extra =
      (plainTotal * TENDING_FLOOR_PERCENT[engineer.rank] * scale) / 100;
    tierSpeed[post] += extra / running[post];
  }
}

function tenthsFor(mountain: Mountain, tierId: TierId): number {
  const tenths = tendingTenths(mountain, tierId);
  // A little extra on the borer, where an apprentice spends the middle
  // of the run. Crafted gear takes a slice of the same output, so the
  // borer's tenth is larger than the other posts. Enough to clear an 8%
  // share, and short of the jump that lets a checker empty the mountain
  // before day 5.
  return tierId === "borer" ? (tenths * 162) / 100 : tenths;
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

function outputOf(
  speed: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): number {
  return TIERS.reduce(
    (total, tier) => total + running[tier.id] * speed[tier.id],
    0,
  );
}

function primaryTender(
  mountain: Mountain,
  plain: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): { readonly post: TierId; readonly rank: EngineerRank } | undefined {
  let best:
    | {
        readonly post: TierId;
        readonly rank: EngineerRank;
        readonly plain: number;
      }
    | undefined;
  for (const engineer of mountain.engineers ?? []) {
    if (engineer.post === "camp" || engineer.post === "tunnel") {
      continue;
    }
    const post = engineer.post;
    if (running[post] <= 0) {
      continue;
    }
    const produced = running[post] * plain[post];
    if (
      best === undefined ||
      engineer.rank > best.rank ||
      (engineer.rank === best.rank && produced > best.plain)
    ) {
      best = { post, rank: engineer.rank, plain: produced };
    }
  }
  return best === undefined ? undefined : { post: best.post, rank: best.rank };
}

/** A machine post. Camp and a tunnel tend nothing. */
export type TendTier = Exclude<EngineerPost, "camp" | "tunnel">;

/**
 * Extra stones a second if this engineer tends `post`, from staffed machines
 * only. Compared with them at camp, so a tier nobody can run is +0, and a
 * higher rank already there is not counted twice. Live trouble is included
 * when the caller passes it, so the number matches the crew line.
 */
export function tendingGain(
  mountain: Mountain,
  index: number,
  post: TendTier,
  now?: number,
  trouble?: Trouble,
): number {
  const tended = effectiveRates(
    station(mountain, index, post),
    now,
    trouble,
  ).crewPerSecond;
  const resting = effectiveRates(
    station(mountain, index, "camp"),
    now,
    trouble,
  ).crewPerSecond;
  return Math.max(0, tended - resting);
}

import { activeFactors, factor } from "./economy/factors";
import {
  atHome,
  onTrip,
  promote,
  engineerTenths,
  GRANDPA_RANK,
  staffNeeded,
  station,
  TENDING_GAIN,
  TENDING_TENTHS,
  tendingTenths,
  type EngineerPost,
  type EngineerRank,
} from "./engineers";
import { slowedSpeed, type Trouble } from "./hazards";
import { milestoneMultiplier } from "./milestones";
import { hardnessFactorId, hardnessOf, layerOf } from "./layers";
import {
  axleCrewMultiplier,
  chargeCrewMultiplier,
  emberMachineMultiplier,
  gearMultiplier,
} from "./workshop";
import { callTo } from "./expeditions";
import { tapWithPick } from "./lost-tools";
import type { Mountain } from "./mountain";
import {
  TIERS,
  isMachine,
  owned,
  tierById,
  type MachineId,
  type TierId,
} from "./tiers";
import { hasRelic } from "./relics";
import {
  biggestFirst,
  moreStones,
  staffMachines,
  staffWith,
  type StaffSlot,
  type Staffing,
} from "./staffing";
import { boostById, boostLeft } from "./boosts";
import { rushPerSecond } from "./gold-rush";
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

/**
 * Away pay slopes off the longer you are gone (#278). The first 6 hours pay
 * the full away rate, 6 to 24 hours pay 40% of it, and after a day nothing
 * more: 4 / 8 / 12 / 16 / 24 hours away pay 4 / 6.8 / 8.4 / 10 / 13.2 hours.
 */
export const AWAY_FULL_MS = 6 * 60 * 60 * 1000;
const AWAY_SLOPE_SHARE = 0.4;
export const AWAY_END_MS = 24 * 60 * 60 * 1000;
/** With the Shield, a whole day pays in full. */
export const SHIELD_AWAY_CAP_MS = 24 * 60 * 60 * 1000;

/**
 * Paid time away, as hours at the full away rate. The Shield pays a whole
 * day in full; otherwise the slope above.
 */
export function paidAwayMs(mountain: Mountain, awayMs: number): number {
  const gone = Math.max(0, awayMs);
  if (hasRelic(mountain, "shield")) {
    return Math.min(gone, SHIELD_AWAY_CAP_MS);
  }
  const full = Math.min(gone, AWAY_FULL_MS);
  const slope = Math.max(0, Math.min(gone, AWAY_END_MS) - AWAY_FULL_MS);
  return full + AWAY_SLOPE_SHARE * slope;
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
  return 1 + LEGACY_STEP * mountain.legacy;
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
 * Axle grease, a blasting charge, and Overtime each speed the live crew.
 * The crew runs at the strongest of them. Three timers at ×2 stay ×2.
 * Away pay passes no `now`, and each one is then 1. A stronger recipe
 * still shows on the crew line.
 */
function liveCrewTimer(mountain: Mountain, now: number | undefined): number {
  const overtime =
    now !== undefined && boostLeft(mountain, "overtime", now) > 0
      ? boostById("overtime").multiplier
      : 1;
  return Math.max(
    axleCrewMultiplier(mountain, now),
    chargeCrewMultiplier(mountain, now),
    overtime,
  );
}

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
  const sharper =
    now !== undefined && boostLeft(mountain, "sharper", now) > 0
      ? boostById("sharper").multiplier
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
        milestoneMultiplier(tier.id, owned(mountain, tier)) *
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
  const steady = {} as Record<TierId, number>;
  for (const tier of TIERS) {
    const sped =
      tierSpeed[tier.id] * (1 + tierSynergy(mountain, tier.id)) * legacy;
    steady[tier.id] = sped;
    plain[tier.id] =
      trouble !== undefined && trouble.tier === tier.id
        ? slowedSpeed(sped, trouble.startedAt, now ?? trouble.startedAt)
        : sped;
    tierSpeed[tier.id] = plain[tier.id];
  }
  // Staffing: the hands run the machines that mine the most (#500); a
  // machine short of its crew sits idle. Helpers still mine by hand while
  // they run a machine. Kids count as staff too (Crown of Wisdom).
  const running = staffCrew(mountain, steady);
  const needed = TIERS.reduce(
    (total, tier) =>
      total + owned(mountain, tier) * staffNeeded(mountain, tier),
    0,
  );
  applyTendingFloor(mountain, plain, tierSpeed, running);
  const exactBase = TIERS.reduce(
    (total, tier) => total + running[tier.id] * tierSpeed[tier.id],
    0,
  );
  // Whole stones a second, so what the crew line says is what gets mined.
  const baseCrew = Math.floor(exactBase + 1e-9);
  // Tap power takes its share of the unboosted crew, before any crew timer.
  const tapShare = upgradeLevel(mountain, "tap") * TAP_SHARE_PER_LEVEL;
  // Legacy multiplies the whole tap; its share of the crew is taken before it.
  // Grandfather's pick strengthens that bare tap; Sharper picks still doubles the result.
  const bareTap = Math.floor(
    (1 + Math.floor((baseCrew / legacy) * tapShare + 1e-9)) * legacy + 1e-9,
  );
  const timer = liveCrewTimer(mountain, now);
  // The Gold rush adds its held stones on top of the crew (#468).
  const rush = rushPerSecond(mountain, now);
  return {
    tapYield: tapWithPick(bareTap, mountain) * sharper,
    tierSpeed,
    running,
    helpersShort: Math.max(0, needed - mountain.helpers - mountain.kids),
    exactCrewPerSecond: exactBase * timer + rush,
    crewPerSecond: baseCrew * timer + Math.floor(rush + 1e-9),
    awayPay:
      AWAY_PAY_RATE *
      (1 + upgradeLevel(mountain, "steady") * STEADY_AWAY_PER_LEVEL),
  };
}

/**
 * How many of each tier run (#500): the staffing whose crew, tending and
 * Grandpa included, mines the most. It starts from the best staffing for
 * each guess of where the tending lands, and from the old biggest-first
 * rule, so the crew is never slower than it was. Then it moves one big
 * machine at a time while that mines more, so Grandpa or the floor moving
 * with them is counted. Weighed on the steady speed, so live trouble does
 * not move hands for a few seconds.
 */
function staffCrew(
  mountain: Mountain,
  steady: Readonly<Record<TierId, number>>,
): Record<TierId, number> {
  const slots = staffSlots(mountain, steady);
  const hands = mountain.helpers + mountain.kids;
  const weigh = (staffing: Staffing): Weighed => {
    const running = runningOf(mountain, staffing);
    return {
      staffing,
      running,
      stones: tendedOutput(mountain, steady, running),
    };
  };
  let best = weigh(biggestFirst(slots, hands));
  for (const guess of slotGuesses(mountain, slots)) {
    const next = weigh(staffMachines(guess, hands));
    if (moreStones(next.stones, best.stones)) {
      best = next;
    }
  }
  return climb(slots, hands, best, weigh).running;
}

type Weighed = {
  readonly staffing: Staffing;
  readonly running: Record<TierId, number>;
  readonly stones: number;
};

/**
 * One big machine more or fewer, or one kind traded for another, while that
 * mines more.
 */
function climb(
  slots: readonly StaffSlot[],
  hands: number,
  start: Weighed,
  weigh: (staffing: Staffing) => Weighed,
): Weighed {
  const steps = climbSteps(slots);
  let best = start;
  for (let moved = true; moved;) {
    moved = false;
    for (const step of steps) {
      const counts = { ...best.staffing };
      for (const [id, by] of step) {
        counts[id] += by;
      }
      const staffing = staffWith(slots, hands, counts);
      const next = staffing === undefined ? undefined : weigh(staffing);
      if (next !== undefined && moreStones(next.stones, best.stones)) {
        best = next;
        moved = true;
      }
    }
  }
  return best;
}

/** Each big machine ±1, and each pair of kinds traded one for one. */
function climbSteps(
  slots: readonly StaffSlot[],
): readonly (readonly [MachineId, number])[][] {
  const big = slots.filter((slot) => slot.staff > 1).map((slot) => slot.id);
  const steps: (readonly [MachineId, number])[][] = [];
  for (const id of big) {
    steps.push([[id, 1]], [[id, -1]]);
    for (const other of big) {
      if (other !== id) {
        steps.push([
          [id, 1],
          [other, -1],
        ]);
      }
    }
  }
  return steps;
}

/** The machines biggest first, on their steady speed with the engineers' tenths. */
function staffSlots(
  mountain: Mountain,
  steady: Readonly<Record<TierId, number>>,
): StaffSlot[] {
  return TIERS.filter(isMachine)
    .reverse()
    .map((tier) => {
      const tenths = scaledTenths(tier.id, engineerTenths(mountain, tier.id));
      return {
        id: tier.id,
        staff: staffNeeded(mountain, tier),
        count: owned(mountain, tier),
        speed: (steady[tier.id] * (10 + tenths)) / 10,
      };
    });
}

/**
 * Where the tending may land, as machine speeds to staff on: the engineers'
 * tenths alone; Grandpa's tenth on each machine he could take; and each
 * engineer's post kept running, for the floor that tops it up (#178).
 */
function slotGuesses(
  mountain: Mountain,
  slots: readonly StaffSlot[],
): StaffSlot[][] {
  const guesses = [slots.slice()];
  const posts = new Set<TierId>(
    atHome(mountain).flatMap((one) => (one.post === "camp" ? [] : [one.post])),
  );
  const grandpa =
    mountain.legacy >= 1
      ? factor("tending.gain") * TENDING_GAIN * TENDING_TENTHS[GRANDPA_RANK]
      : 0;
  const all = slots.reduce((total, slot) => total + slot.count * slot.speed, 0);
  for (const slot of slots) {
    if (slot.count === 0) {
      continue;
    }
    if (grandpa > 0 && !posts.has(slot.id)) {
      const tenths = scaledTenths(slot.id, grandpa);
      guesses.push(
        withSpeed(slots, slot.id, (slot.speed * (10 + tenths)) / 10),
      );
    }
    if (posts.has(slot.id) && mountain.machines >= 1) {
      guesses.push(withSpeed(slots, slot.id, slot.speed + all));
    }
  }
  return guesses;
}

function withSpeed(
  slots: readonly StaffSlot[],
  id: MachineId,
  speed: number,
): StaffSlot[] {
  return slots.map((slot) => (slot.id === id ? { ...slot, speed } : slot));
}

function runningOf(
  mountain: Mountain,
  staffing: Staffing,
): Record<TierId, number> {
  return { helper: mountain.helpers, kid: mountain.kids, ...staffing };
}

/** What the machines and hands mine with this staffing, tending included. */
function tendedOutput(
  mountain: Mountain,
  steady: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): number {
  const speed = { ...steady };
  applyTendingFloor(mountain, steady, speed, running);
  return outputOf(speed, running);
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
    applyAllTenths(mountain, plain, tierSpeed, running);
    return;
  }
  const scale = factor("tending.gain") * TENDING_GAIN;
  const plainTotal = outputOf(plain, running);
  const floorStones =
    (plainTotal * TENDING_FLOOR_PERCENT[primary.rank] * scale) / 100;
  const tenths = tenthsFor(mountain, primary.post, running);
  const primaryBonus =
    running[primary.post] * plain[primary.post] * (tenths / 10);
  // Before the Great Machine, today's tenths keep the checker on day 5.
  // Standing on the machine already pays its own tenth.
  if (
    mountain.machines < 1 ||
    primary.post === "machine" ||
    primaryBonus >= floorStones
  ) {
    applyAllTenths(mountain, plain, tierSpeed, running);
    addExtraPosts(mountain, plain, tierSpeed, running, primary.post, scale);
    return;
  }
  for (const tier of TIERS) {
    if (tier.id === primary.post) {
      continue;
    }
    const extra = tenthsFor(mountain, tier.id, running);
    tierSpeed[tier.id] = (plain[tier.id] * (10 + extra)) / 10;
  }
  // The other tiers already carry their own tenths, set just above. Adding
  // that gain to the floor's post as well counted it twice (#349).
  tierSpeed[primary.post] =
    plain[primary.post] + floorStones / running[primary.post];
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
  for (const engineer of atHome(mountain)) {
    const post = engineer.post;
    if (
      post === "camp" ||
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

/**
 * An apprentice on the borer is +17.5% (seven quarters of the published
 * +10% tenth). Journeyman and master scale the same way. That keeps
 * tending about a tenth clear of the 8% bar.
 */
const BORER_TENTHS_SCALE = 7 / 4;

function tenthsFor(
  mountain: Mountain,
  tierId: TierId,
  running: Readonly<Record<TierId, number>>,
): number {
  return scaledTenths(tierId, tendingTenths(mountain, tierId, running));
}

function scaledTenths(tierId: TierId, tenths: number): number {
  return tierId === "borer" ? tenths * BORER_TENTHS_SCALE : tenths;
}

function applyAllTenths(
  mountain: Mountain,
  plain: Readonly<Record<TierId, number>>,
  tierSpeed: Record<TierId, number>,
  running: Readonly<Record<TierId, number>>,
): void {
  for (const tier of TIERS) {
    const tenths = tenthsFor(mountain, tier.id, running);
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
  for (const engineer of atHome(mountain)) {
    if (engineer.post === "camp") {
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

/** A machine post. Camp and a trip tend nothing. */
export type TendTier = Exclude<EngineerPost, "camp">;

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
    callTo(mountain, index, post),
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

/** The crew's speed before crew timers and the Gold rush: what its machines and hands mine. */
function baseOutput(rates: Rates): number {
  return outputOf(rates.tierSpeed, rates.running);
}

/** The mountain with `count` more workers or kids. */
function withHands(
  mountain: Mountain,
  tier: "helper" | "kid",
  count: number,
): Mountain {
  return tier === "helper"
    ? { ...mountain, helpers: mountain.helpers + count }
    : { ...mountain, kids: mountain.kids + count };
}

/**
 * What `count` more workers or kids add to the crew (#490): the crew's speed
 * with them less its speed now, before crew timers and the Gold rush. It
 * counts the idle machines they start, so the Ready now plate and the Buys
 * rows say what the crew line will gain, not only their own hands. Never
 * below zero.
 */
export function handsGain(
  mountain: Mountain,
  tier: "helper" | "kid",
  count: number,
  now?: number,
  trouble?: Trouble,
): number {
  const before = baseOutput(effectiveRates(mountain, now, trouble));
  const after = baseOutput(
    effectiveRates(withHands(mountain, tier, count), now, trouble),
  );
  // Staffing mines the most it can (#500), so a hand never slows the crew;
  // the floor only guards float dust.
  return Math.max(0, after - before);
}

/** The idle kinds of machine, biggest first, and the rates that say so. */
function idleTiers(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): { readonly rates: Rates; readonly idle: readonly TendTier[] } {
  const rates = effectiveRates(mountain, now, trouble);
  const idle = STAFFED_TIERS.filter(
    (id) => owned(mountain, tierById(id)) > rates.running[id],
  );
  return { rates, idle };
}

/**
 * The idle machine one more worker really starts (#490), read from the
 * rates with him. Undefined when nothing stands idle, or when one more
 * worker starts nothing yet (a borer still short of its eight).
 */
export function startedTier(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): TendTier | undefined {
  const { rates, idle } = idleTiers(mountain, now, trouble);
  if (idle.length === 0) {
    return undefined;
  }
  const hired = effectiveRates(withHands(mountain, "helper", 1), now, trouble);
  return idle.find((id) => hired.running[id] > rates.running[id]);
}

/**
 * The first idle machine (#246): the one the next hired worker really
 * starts. When one worker starts nothing yet, the biggest idle kind.
 * Undefined when nothing stands idle.
 */
export function firstIdleTier(
  mountain: Mountain,
  now?: number,
  trouble?: Trouble,
): TendTier | undefined {
  return (
    startedTier(mountain, now, trouble) ??
    idleTiers(mountain, now, trouble).idle[0]
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

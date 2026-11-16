import { activeFactors, factor } from "./economy/factors";
import {
  atHome,
  onTrip,
  promote,
  ENGINEER_POSTS,
  engineerTenths,
  MAX_ENGINEERS,
  staffNeeded,
  station,
  TENDING_GAIN,
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
import { handsSpeed, lineOf, lineRating } from "./line";
import { freshMineOn, lineOn } from "./line-switch";
import { nightShiftShare } from "./city";
import { lineWork } from "./workforce";
import type { Mountain } from "./mountain";
import {
  TIERS,
  isMachine,
  MACHINE_IDS,
  owned,
  setOwned,
  tierById,
  tierInPlay,
  type MachineId,
  type TierId,
} from "./tiers";
import {
  biggestFirst,
  fillForLine,
  moreStones,
  staffForLine,
  staffMachines,
  staffWith,
  type StaffSlot,
  type Staffing,
} from "./staffing";
import { BOOTS_SPEED_PER_LEVEL, tierSynergy, upgradeLevel } from "./upgrades";

/**
 * Share of the crew's speed paid for time away (app closed or in the
 * background). Tuned by src/pacing.test.ts.
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

/**
 * An apprentice tending a running machine is at least this percent of the
 * crew. Journeyman and Master raise it. The tier's own tenths still win
 * when they are already larger, so a Great Machine she stands on is not
 * paid twice. #178.
 */
const TENDING_FLOOR_PERCENT = [12, 16, 20] as const;

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
 * Axle grease and a blasting charge each speed the live crew. The crew runs
 * at the stronger of them. Two timers at ×2 stay ×2. Away pay passes no
 * `now`, and each one is then 1. A stronger recipe still shows on the crew
 * line.
 */
export function crewTimer(mountain: Mountain, now: number | undefined): number {
  return Math.max(
    axleCrewMultiplier(mountain, now),
    chargeCrewMultiplier(mountain, now),
  );
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
  const layer = layerOf(mountain);
  const tierSpeed = Object.fromEntries(
    TIERS.map((tier) => {
      // A sweep scales the tier's own stones a second, and the rock of this
      // layer. Both factors are 1 in play.
      const ember =
        tier.id === "machine" ? emberMachineMultiplier(mountain, now) : 1;
      const output =
        tier.perSecond *
        lineRating(tier.id) *
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
  const plain = {} as Record<TierId, number>;
  const steady = {} as Record<TierId, number>;
  for (const tier of TIERS) {
    const sped = tierSpeed[tier.id] * (1 + tierSynergy(mountain, tier.id));
    steady[tier.id] = sped;
    plain[tier.id] =
      trouble !== undefined && trouble.tier === tier.id
        ? slowedSpeed(sped, trouble.startedAt, now ?? trouble.startedAt)
        : sped;
    tierSpeed[tier.id] = plain[tier.id];
  }
  const { running, exactBase, helpersShort } = crewRun(
    mountain,
    plain,
    steady,
    tierSpeed,
  );
  // Whole stones a second, so what the crew line says is what gets mined.
  const baseCrew = Math.floor(exactBase + 1e-9);
  const timer = crewTimer(mountain, now);
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
 * Who runs what, and what the crew moves before the whole-stone floor.
 * `tierSpeed` comes in plain and leaves tended.
 */
function crewRun(
  mountain: Mountain,
  plain: Readonly<Record<TierId, number>>,
  steady: Readonly<Record<TierId, number>>,
  tierSpeed: Record<TierId, number>,
): CrewRun {
  if (freshMineOn()) {
    return workforceRun(mountain, plain, tierSpeed);
  }
  // Staffing: the hands run the machines that mine the most (#500); a
  // machine short of its crew sits idle. Helpers still mine by hand while
  // they run a machine. Kids count as staff too.
  const running = keptStaffing(mountain, steady);
  const needed = TIERS.filter(tierInPlay).reduce(
    (total, tier) =>
      total + owned(mountain, tier) * staffNeeded(mountain, tier),
    0,
  );
  applyTendingFloor(mountain, plain, tierSpeed, running);
  return {
    running,
    exactBase: crewOutput(tierSpeed, running),
    helpersShort: Math.max(
      0,
      needed - mountain.owned.helper - mountain.owned.kid,
    ),
  };
}

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
 * How many of each tier run (#500), kept by everything that can change it:
 * a tick or a price check asks about the same crew on a new mountain many
 * times. When the tending cannot move, the slots' best is the answer;
 * otherwise the staffing is weighed in full.
 */
const staffings = new Map<
  number,
  { readonly key: Float64Array; readonly running: Record<TierId, number> }
>();
const STAFFINGS_KEPT = 4096;
const KEY_LENGTH = 3 + TIERS.length + MACHINE_IDS.length + 2 * MAX_ENGINEERS;
const scratchKey = new Float64Array(KEY_LENGTH);
const scratchWords = new Uint32Array(scratchKey.buffer);

function keptStaffing(
  mountain: Mountain,
  steady: Readonly<Record<TierId, number>>,
): Record<TierId, number> {
  const hash = writeStaffingKey(mountain, steady);
  const kept = staffings.get(hash);
  if (kept !== undefined && sameKey(kept.key, scratchKey)) {
    return { ...kept.running };
  }
  const key = scratchKey.slice();
  const slots = staffSlots(mountain, steady);
  // With the line on, staffing weighs the line (#534), so it always searches.
  const running =
    !lineOn() && tendingStaysPut(mountain)
      ? // The tenths are the slots' own, so the best for them is the best.
        runningOf(
          mountain,
          staffMachines(slots, mountain.owned.helper + mountain.owned.kid),
        )
      : staffCrew(mountain, steady, slots);
  if (staffings.size >= STAFFINGS_KEPT) {
    staffings.clear();
  }
  staffings.set(hash, { key, running });
  return { ...running };
}

/**
 * Writes what can change the staffing into `scratchKey` and returns its
 * hash: the hands, the tending gain, each tier's steady speed,
 * the machines owned, and the engineers at home with their posts.
 */
function writeStaffingKey(
  mountain: Mountain,
  steady: Readonly<Record<TierId, number>>,
): number {
  scratchKey.fill(-1);
  scratchKey[0] = mountain.owned.helper + mountain.owned.kid;
  scratchKey[1] = factor("tending.gain");
  // The line's machines take hands only while the line is on (#533).
  scratchKey[2] = lineOn() ? 1 : 0;
  let at = 3;
  for (const tier of TIERS) {
    scratchKey[at] = steady[tier.id];
    at += 1;
  }
  for (const id of MACHINE_IDS) {
    scratchKey[at] = mountain.owned[id];
    at += 1;
  }
  for (const one of atHome(mountain)) {
    scratchKey[at] = ENGINEER_POSTS.indexOf(one.post);
    scratchKey[at + 1] = one.rank;
    at += 2;
  }
  let hash = 2_166_136_261;
  for (const word of scratchWords) {
    hash = Math.imul(hash ^ word, 16_777_619);
  }
  return hash;
}

function sameKey(a: Float64Array, b: Float64Array): boolean {
  return a.every((value, at) => value === b[at]);
}

/**
 * How many of each tier run (#500): the staffing it can find whose crew,
 * tending included, mines the most. It starts from the best
 * staffing for each guess of where the tending lands, and from the old
 * biggest-first rule, so the crew is never slower than it was. Then it
 * moves or trades one big machine at a time while that mines more, so
 * the floor moving with them is counted. Weighed on the steady speed, so live trouble does
 * not move hands for a few seconds.
 */
function staffCrew(
  mountain: Mountain,
  steady: Readonly<Record<TierId, number>>,
  slots: readonly StaffSlot[],
): Record<TierId, number> {
  const hands = mountain.owned.helper + mountain.owned.kid;
  // With the line on, the one-hand machines fill the line (#534).
  const line = lineOn()
    ? handsSpeed(steady, runningOf(mountain, biggestFirst(slots, 0)))
    : undefined;
  const weighed = new Map<string, Weighed>();
  const weigh = (staffing: Staffing): Weighed => {
    const key = MACHINE_IDS.map((id) => String(staffing[id])).join(" ");
    const kept = weighed.get(key);
    if (kept !== undefined) {
      return kept;
    }
    const running = runningOf(mountain, staffing);
    const next = {
      staffing,
      running,
      stones: tendedOutput(mountain, steady, running),
    };
    weighed.set(key, next);
    return next;
  };
  // With the line on, each staffing is weighed as the hands fill it today
  // and as they fill the line, with spare hands above the line or not.
  const fills = (staffing: Staffing): Weighed => {
    let best = weigh(staffing);
    if (line === undefined) {
      return best;
    }
    for (const spareAbove of [true, false]) {
      const next = weigh(fillForLine(slots, hands, staffing, line, spareAbove));
      if (moreStones(next.stones, best.stones)) {
        best = next;
      }
    }
    return best;
  };
  let best = fills(biggestFirst(slots, hands));
  const starts = [
    ...slotGuesses(mountain, slots).map((guess) => staffMachines(guess, hands)),
    ...(line === undefined ? [] : staffForLine(slots, hands, line)),
  ];
  for (const start of starts) {
    const next = fills(start);
    if (moreStones(next.stones, best.stones)) {
      best = next;
    }
  }
  return climb(slots, hands, best, (staffing) => fills(staffing)).running;
}

/**
 * At most one engineer's post, with no floor to top it up
 * (before the Great Machine, or on it): each machine runs at its slot's own
 * speed, whatever else runs (#178).
 */
function tendingStaysPut(mountain: Mountain): boolean {
  const posts = new Set(
    atHome(mountain).flatMap((one) => (one.post === "camp" ? [] : [one.post])),
  );
  const [post, ...more] = posts;
  return (
    post === undefined ||
    (more.length === 0 && (mountain.owned.machine < 1 || post === "machine"))
  );
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
  // A machine of the line takes no hands while the line is off (#533).
  return TIERS.filter(isMachine)
    .filter(tierInPlay)
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
 * tenths alone; and each engineer's post kept running, for the floor that tops it up (#178).
 */
function slotGuesses(
  mountain: Mountain,
  slots: readonly StaffSlot[],
): StaffSlot[][] {
  const guesses = [slots.slice()];
  const posts = new Set<TierId>(
    atHome(mountain).flatMap((one) => (one.post === "camp" ? [] : [one.post])),
  );
  const all = slots.reduce((total, slot) => total + slot.count * slot.speed, 0);
  for (const slot of slots) {
    if (slot.count === 0) {
      continue;
    }
    if (posts.has(slot.id) && mountain.owned.machine >= 1) {
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
  return {
    helper: mountain.owned.helper,
    kid: mountain.owned.kid,
    ...staffing,
  };
}

/** What the machines and hands mine with this staffing, tending included. */
function tendedOutput(
  mountain: Mountain,
  steady: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): number {
  const speed = { ...steady };
  applyTendingFloor(mountain, steady, speed, running);
  return crewOutput(speed, running);
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
  const scale = factor("tending.gain") * TENDING_GAIN;
  const plainTotal = crewOutput(plain, running);
  const floorStones =
    (plainTotal * TENDING_FLOOR_PERCENT[primary.rank] * scale) / 100;
  const tenths = tenthsFor(mountain, primary.post);
  const primaryBonus =
    running[primary.post] * plain[primary.post] * (tenths / 10);
  // Before the Great Machine, today's tenths keep the checker on day 5.
  // Standing on the machine already pays its own tenth.
  if (
    mountain.owned.machine < 1 ||
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
  const plainTotal = crewOutput(plain, running);
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

/**
 * What the crew moves, before crew timers: the sum of its machines and
 * hands, or, with the line on (#532, off in play), what the line moves
 * (`src/line.ts`). Staffing weighs it too (#534).
 */
function crewOutput(
  speed: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): number {
  return lineOn() ? lineOf(speed, running) : outputOf(speed, running);
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

/** The crew's speed before crew timers: what its machines and hands mine. */
function baseOutput(rates: Rates): number {
  return crewOutput(rates.tierSpeed, rates.running);
}

/** The mountain with `count` more workers or kids. */
function withHands(
  mountain: Mountain,
  tier: "helper" | "kid",
  count: number,
): Mountain {
  return setOwned(mountain, tier, mountain.owned[tier] + count);
}

/**
 * What `count` more workers or kids add to the crew (#490): the crew's speed
 * with them less its speed now, before crew timers. It
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
  // Staffing mines the most it can find (#500), so a hand rarely slows the
  // crew; the gain shown never goes below nothing.
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

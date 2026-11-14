import {
  MACHINE_STAGE,
  STAGES,
  lineSpeed,
  type Stage,
  type StageSpeeds,
} from "./line";
import type { MachineId } from "./tiers";

/** One kind of machine the crew can staff. */
export type StaffSlot = {
  readonly id: MachineId;
  /** Hands one of them takes to run. */
  readonly staff: number;
  /** How many are owned. */
  readonly count: number;
  /** Stones a second one of them mines while it runs. */
  readonly speed: number;
};

/** How many of each machine run. */
export type Staffing = Readonly<Record<MachineId, number>>;

const NONE_RUNNING: Staffing = {
  cart: 0,
  hoist: 0,
  drill: 0,
  borer: 0,
  train: 0,
  machine: 0,
};

/** Float dust between two equal crews never moves a hand. */
export function moreStones(stones: number, than: number): boolean {
  return stones > than + 1e-9 * Math.max(1, Math.abs(than));
}

/**
 * How many of each machine the hands run (#500): the staffing that mines
 * the most stones a second. A machine runs only fully staffed. So a borer
 * or a Great Machine never takes hands that earn more on the machines
 * below it, and for these speeds one more hand never mines less. `slots` come biggest
 * machine first; on a tie the bigger machines run, as they did before. A
 * machine that takes one hand is filled fastest first; any other is tried
 * count by count.
 */
export function staffMachines(
  slots: readonly StaffSlot[],
  hands: number,
): Staffing {
  const fillers = fastestFirst(slots);
  const big = slots.filter((slot) => slot.staff > 1);
  const running = { ...NONE_RUNNING };
  let free = Math.max(0, hands);
  big.forEach((slot, index) => {
    const n = bestCount(big, index, slot, free, fillers);
    running[slot.id] = n;
    free -= n * slot.staff;
  });
  return fill(fillers, free, running);
}

function fastestFirst(slots: readonly StaffSlot[]): StaffSlot[] {
  return slots
    .filter((slot) => slot.staff === 1)
    .sort((a, b) => b.speed - a.speed);
}

/**
 * The count of `big[index]` that mines the most, with the kinds after it
 * and the one-hand machines at their best. Counts run most first, so a tie
 * keeps the most.
 */
function bestCount(
  big: readonly StaffSlot[],
  index: number,
  slot: StaffSlot,
  hands: number,
  fillers: readonly StaffSlot[],
): number {
  let bestN = -1;
  let bestStones = 0;
  eachCount(big, index, slot, hands, fillers, (n, stones) => {
    if (bestN < 0 || moreStones(stones, bestStones)) {
      bestN = n;
      bestStones = stones;
    }
  });
  return bestN;
}

/** The most `big[index..]` and the one-hand machines mine with `hands`. */
function stonesFrom(
  big: readonly StaffSlot[],
  index: number,
  hands: number,
  fillers: readonly StaffSlot[],
): number {
  const slot = big[index];
  if (slot === undefined) {
    return fillStones(fillers, hands);
  }
  let best = 0;
  eachCount(big, index, slot, hands, fillers, (_, stones) => {
    best = Math.max(best, stones);
  });
  return best;
}

/**
 * Each count of `big[index]` worth trying, most first, with what it mines
 * alongside the best of the rest. Every count is tried, except for the last
 * kind: what the one-hand machines mine bends only where one kind of them
 * runs out, so its best count sits at a bend (rounded either way) or at an
 * end.
 */
function eachCount(
  big: readonly StaffSlot[],
  index: number,
  slot: StaffSlot,
  hands: number,
  fillers: readonly StaffSlot[],
  visit: (n: number, stones: number) => void,
): void {
  const most = Math.min(slot.count, Math.floor(hands / slot.staff));
  const tryCount = (n: number): void => {
    const at = Math.min(most, Math.max(0, n));
    const rest = stonesFrom(big, index + 1, hands - at * slot.staff, fillers);
    visit(at, at * slot.speed + rest);
  };
  if (index < big.length - 1) {
    for (let n = most; n >= 0; n -= 1) {
      tryCount(n);
    }
    return;
  }
  tryCount(most);
  let filled = 0;
  for (const bend of [0, ...fillers.map((filler) => filler.count)]) {
    filled += bend;
    const at = (hands - filled) / slot.staff;
    tryCount(Math.ceil(at));
    tryCount(Math.floor(at));
  }
  tryCount(0);
}

function fillStones(fillers: readonly StaffSlot[], hands: number): number {
  let free = hands;
  let stones = 0;
  for (const filler of fillers) {
    const n = Math.min(filler.count, free);
    free -= n;
    stones += n * filler.speed;
  }
  return stones;
}

/** One-hand machines, fastest first, as far as the hands go, on `running`. */
function fill(
  fillers: readonly StaffSlot[],
  hands: number,
  running: Staffing,
): Staffing {
  const filled = { ...running };
  let free = hands;
  for (const filler of fillers) {
    const n = Math.min(filler.count, free);
    filled[filler.id] = n;
    free -= n;
  }
  return filled;
}

/**
 * The old rule, biggest machine first (#89): each kind runs as many as the
 * hands left can staff. `effectiveRates` weighs it with the others, so the
 * crew is never slower than it was.
 */
export function biggestFirst(
  slots: readonly StaffSlot[],
  hands: number,
): Staffing {
  const running = { ...NONE_RUNNING };
  let free = Math.max(0, hands);
  for (const slot of slots) {
    const n = Math.min(slot.count, Math.floor(free / slot.staff));
    running[slot.id] = n;
    free -= n * slot.staff;
  }
  return running;
}

/**
 * `staffing` with its big machines kept and the one-hand machines filled
 * from the hands left, or undefined when the hands or the machines owned
 * are too few. Fastest first; with the line on (`lineHands`, the hands'
 * stones a second, #534), so the line moves the most, with spare hands
 * on stages above the line too unless `spareAbove` is false.
 */
export function staffWith(
  slots: readonly StaffSlot[],
  hands: number,
  staffing: Staffing,
  lineHands?: number,
  spareAbove = true,
): Staffing | undefined {
  let free = hands;
  for (const slot of slots) {
    if (slot.staff === 1) {
      continue;
    }
    const n = staffing[slot.id];
    if (n < 0 || n > slot.count) {
      return undefined;
    }
    free -= n * slot.staff;
  }
  if (free < 0) {
    return undefined;
  }
  return lineHands === undefined
    ? fill(fastestFirst(slots), free, staffing)
    : fillLine(slots, free, staffing, lineHands, spareAbove);
}

/** What each stage's big machines move with these counts. */
function bigStages(
  slots: readonly StaffSlot[],
  staffing: Staffing,
): Record<Stage, number> {
  const stages = { face: 0, haul: 0, lift: 0 };
  for (const slot of slots) {
    if (slot.staff > 1) {
      stages[MACHINE_STAGE[slot.id]] += staffing[slot.id] * slot.speed;
    }
  }
  return stages;
}

/** Each stage with every one of these one-hand machines running. */
function withFillers(
  base: StageSpeeds,
  fillers: readonly StaffSlot[],
  running: Staffing,
): StageSpeeds {
  const stages = { ...base };
  for (const filler of fillers) {
    stages[MACHINE_STAGE[filler.id]] += running[filler.id] * filler.speed;
  }
  return stages;
}

/** A run of one-hand machines that each cover `value` of a stage's gap. */
type Cover = {
  readonly id: MachineId;
  readonly value: number;
  readonly count: number;
};

/** What the one-hand machines can cover of each stage's gap below `level`. */
function coversFor(
  base: StageSpeeds,
  fillers: readonly StaffSlot[],
  level: number,
): Cover[] {
  const covers: Cover[] = [];
  for (const stage of STAGES) {
    let gap = Math.max(0, level - base[stage]);
    for (const filler of fillers) {
      if (MACHINE_STAGE[filler.id] !== stage || gap <= 0) {
        continue;
      }
      const full = Math.min(filler.count, Math.floor(gap / filler.speed));
      covers.push({ id: filler.id, value: filler.speed, count: full });
      gap -= full * filler.speed;
      if (filler.count > full && gap > 0) {
        covers.push({ id: filler.id, value: gap, count: 1 });
        gap = 0;
      }
    }
  }
  return covers.sort((a, b) => b.value - a.value);
}

/**
 * The one-hand machines `free` hands run so the line reaches `level`, or
 * undefined when it cannot: every hand runs the machine that covers the
 * most of a gap, and the hands' own work covers the rest.
 */
function picksFor(
  base: StageSpeeds,
  fillers: readonly StaffSlot[],
  level: number,
  free: number,
  lineHands: number,
): Map<MachineId, number> | undefined {
  const gaps = STAGES.reduce(
    (total, stage) => total + Math.max(0, level - base[stage]),
    0,
  );
  const picks = new Map<MachineId, number>();
  let left = free;
  let covered = 0;
  for (const cover of coversFor(base, fillers, level)) {
    const n = Math.min(cover.count, left);
    picks.set(cover.id, (picks.get(cover.id) ?? 0) + n);
    covered += n * cover.value;
    left -= n;
  }
  const work = STAGES.length * lineHands;
  return gaps - covered <= work + 1e-9 * Math.max(1, gaps) ? picks : undefined;
}

/**
 * The one-hand machines that move the line the most (#534): the highest
 * level the free hands can reach, found by halving, then any spare hands on
 * the idle machines left. For these big counts the level is the best the
 * hands can reach; the search over big counts is where it can miss.
 */
function fillLine(
  slots: readonly StaffSlot[],
  free: number,
  staffing: Staffing,
  lineHands: number,
  spareAbove: boolean,
): Staffing {
  const fillers = fastestFirst(slots);
  const owned = fillers.reduce((total, filler) => total + filler.count, 0);
  if (free >= owned) {
    return fill(fillers, free, staffing);
  }
  const base = bigStages(slots, staffing);
  let low = lineSpeed(base, lineHands);
  let high = lineSpeed(
    withFillers(base, fillers, fill(fillers, owned, staffing)),
    lineHands,
  );
  for (let step = 0; step < 60 && high - low > 1e-9 * high; step += 1) {
    const mid = (low + high) / 2;
    if (picksFor(base, fillers, mid, free, lineHands) === undefined) {
      high = mid;
    } else {
      low = mid;
    }
  }
  const picks =
    picksFor(base, fillers, low, free, lineHands) ??
    new Map<MachineId, number>();
  const running = { ...staffing };
  let spare = free;
  for (const filler of fillers) {
    running[filler.id] = picks.get(filler.id) ?? 0;
    spare -= running[filler.id];
  }
  return spareToLowest(base, fillers, running, spare, {
    lineHands,
    spareAbove,
  });
}

/**
 * Hands left over once the level is reached go to the lowest stage that
 * still has an idle machine, up to the next stage, so a stage the tending
 * raises later finds the next one ready. Unless `spareAbove`, a stage
 * already above the line gets none: a machine there moves nothing, and it
 * could pull Grandpa off the group he tends. Which is better depends on
 * where the tending lands, so the search weighs both.
 */
function spareToLowest(
  base: StageSpeeds,
  fillers: readonly StaffSlot[],
  running: Record<MachineId, number>,
  spare: number,
  line: { readonly lineHands: number; readonly spareAbove: boolean },
): Staffing {
  let left = spare;
  while (left > 0) {
    const stages = withFillers(base, fillers, running);
    const idle = fillers.filter((filler) => running[filler.id] < filler.count);
    const [low] = idle.sort(
      (a, b) => stages[MACHINE_STAGE[a.id]] - stages[MACHINE_STAGE[b.id]],
    );
    if (
      low === undefined ||
      (!line.spareAbove &&
        moreStones(
          stages[MACHINE_STAGE[low.id]],
          lineSpeed(stages, line.lineHands),
        ))
    ) {
      break;
    }
    const above = STAGES.map((stage) => stages[stage]).filter(
      (speed) => speed > stages[MACHINE_STAGE[low.id]],
    );
    const reach =
      above.length === 0
        ? Number.POSITIVE_INFINITY
        : (Math.min(...above) - stages[MACHINE_STAGE[low.id]]) / low.speed;
    const n = Math.min(
      left,
      low.count - running[low.id],
      Math.max(1, Math.ceil(reach)),
    );
    running[low.id] += n;
    left -= n;
  }
  return running;
}

/** At most this many big-machine counts are tried for the line (#534). */
const LINE_COUNTS_TRIED = 64;

/** Of the counts that tie for the line, at most this many are weighed. */
const LINE_TIES_KEPT = 8;

/**
 * With the line on (#534): every count of the big machines the hands can
 * run, each filled for the line, and the ones that move the line the most
 * on these speeds (a few, when they tie: the tending, weighed later, tells
 * them apart). The line is flat while a stage is empty, so a climb from
 * the sum's best can stall there; while there are few counts, all are
 * tried. None when there are more than `LINE_COUNTS_TRIED`.
 */
export function staffForLine(
  slots: readonly StaffSlot[],
  hands: number,
  lineHands: number,
): readonly Staffing[] {
  const big = slots.filter((slot) => slot.staff > 1);
  const most = big.map((slot) =>
    Math.min(slot.count, Math.floor(Math.max(0, hands) / slot.staff)),
  );
  if (most.reduce((total, n) => total * (n + 1), 1) > LINE_COUNTS_TRIED) {
    return [];
  }
  const fillers = fastestFirst(slots);
  let best: Staffing[] = [];
  let bestLine = -1;
  const visit = (counts: Staffing): void => {
    const staffing = staffWith(slots, hands, counts, lineHands);
    if (staffing === undefined) {
      return;
    }
    const line = lineSpeed(
      withFillers(bigStages(slots, staffing), fillers, staffing),
      lineHands,
    );
    if (moreStones(line, bestLine)) {
      best = [staffing];
      bestLine = line;
    } else if (!moreStones(bestLine, line) && best.length < LINE_TIES_KEPT) {
      best.push(staffing);
    }
  };
  eachBigCount(big, most, 0, { ...NONE_RUNNING }, visit);
  return best;
}

function eachBigCount(
  big: readonly StaffSlot[],
  most: readonly number[],
  index: number,
  counts: Record<MachineId, number>,
  visit: (counts: Staffing) => void,
): void {
  const slot = big[index];
  if (slot === undefined) {
    visit({ ...counts });
    return;
  }
  for (let n = most[index] ?? 0; n >= 0; n -= 1) {
    counts[slot.id] = n;
    eachBigCount(big, most, index + 1, counts, visit);
  }
}

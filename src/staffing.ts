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

const NONE_RUNNING: Staffing = { cart: 0, drill: 0, borer: 0, machine: 0 };

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
 * fastest first from the hands left, or undefined when the hands or the
 * machines owned are too few.
 */
export function staffWith(
  slots: readonly StaffSlot[],
  hands: number,
  staffing: Staffing,
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
  return fill(fastestFirst(slots), free, staffing);
}

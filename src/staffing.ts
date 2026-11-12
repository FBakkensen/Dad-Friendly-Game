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

type Pick = {
  readonly stones: number;
  readonly running: Staffing;
};

const NONE_RUNNING: Staffing = { cart: 0, drill: 0, borer: 0, machine: 0 };

/** Float dust between two equal crews never moves a hand. */
export function moreStones(stones: number, than: number): boolean {
  return stones > than + 1e-9 * Math.max(1, Math.abs(than));
}

/**
 * How many of each machine the hands run (#500): the staffing that mines
 * the most stones a second. A machine runs only fully staffed. So a borer
 * or a Great Machine never takes hands that earn more on the machines
 * below it, and one more hand never mines less. `slots` come biggest
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
  return bestFrom(big, 0, Math.max(0, hands), fillers).running;
}

function fastestFirst(slots: readonly StaffSlot[]): StaffSlot[] {
  return slots
    .filter((slot) => slot.staff === 1)
    .sort((a, b) => b.speed - a.speed);
}

/**
 * The best staffing of `big[index..]` and the one-hand machines under
 * them. Every count of a big machine is tried, except the last kind, where
 * only the counts at a bend of the one-hand machines can be best.
 */
function bestFrom(
  big: readonly StaffSlot[],
  index: number,
  hands: number,
  fillers: readonly StaffSlot[],
): Pick {
  const slot = big[index];
  if (slot === undefined) {
    return fill(fillers, hands, NONE_RUNNING);
  }
  const most = Math.min(slot.count, Math.floor(hands / slot.staff));
  const counts =
    index === big.length - 1
      ? bendCounts(slot, most, hands, fillers)
      : Array.from({ length: most + 1 }, (_, n) => most - n);
  const tryCount = (n: number): Pick => {
    const rest = bestFrom(big, index + 1, hands - n * slot.staff, fillers);
    return {
      stones: rest.stones + n * slot.speed,
      running: { ...rest.running, [slot.id]: n },
    };
  };
  // The counts run most first, so a tie keeps the most.
  let best = tryCount(most);
  for (const n of counts) {
    const next = tryCount(n);
    if (moreStones(next.stones, best.stones)) {
      best = next;
    }
  }
  return best;
}

/**
 * The counts of the last big machine worth trying, most first. What the
 * one-hand machines mine bends only where one kind of them runs out, so
 * the best count sits at a bend (rounded either way) or at an end.
 */
function bendCounts(
  slot: StaffSlot,
  most: number,
  hands: number,
  fillers: readonly StaffSlot[],
): readonly number[] {
  const counts = new Set([most, 0]);
  let filled = 0;
  for (const bend of [0, ...fillers.map((filler) => filler.count)]) {
    filled += bend;
    const at = (hands - filled) / slot.staff;
    for (const n of [Math.floor(at), Math.ceil(at)]) {
      counts.add(Math.min(most, Math.max(0, n)));
    }
  }
  return [...counts].sort((a, b) => b - a);
}

/** One-hand machines, fastest first, as far as the hands go, on `running`. */
function fill(
  fillers: readonly StaffSlot[],
  hands: number,
  running: Staffing,
): Pick {
  const filled = { ...running };
  let free = hands;
  let stones = 0;
  for (const filler of fillers) {
    const n = Math.min(filler.count, free);
    filled[filler.id] = n;
    free -= n;
    stones += n * filler.speed;
  }
  return { stones, running: filled };
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
  return fill(fastestFirst(slots), free, staffing).running;
}

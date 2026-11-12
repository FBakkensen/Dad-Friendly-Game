import type { TierId } from "./tiers";

/** One kind of machine the crew can staff. */
export type StaffSlot = {
  readonly id: TierId;
  /** Hands one of them takes to run. */
  readonly staff: number;
  /** How many are owned. */
  readonly count: number;
  /** Stones a second one of them mines while it runs. */
  readonly speed: number;
};

type Pick = {
  readonly stones: number;
  readonly running: ReadonlyMap<TierId, number>;
};

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
): ReadonlyMap<TierId, number> {
  const fillers = slots
    .filter((slot) => slot.staff === 1)
    .sort((a, b) => b.speed - a.speed);
  const big = slots.filter((slot) => slot.staff > 1);
  const pick = bestFrom(big, 0, Math.max(0, hands), fillers);
  return new Map(
    slots.map((slot) => [slot.id, pick.running.get(slot.id) ?? 0]),
  );
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
    return fill(fillers, hands);
  }
  const most = Math.min(slot.count, Math.floor(hands / slot.staff));
  const counts =
    index === big.length - 1
      ? bendCounts(slot, most, hands, fillers)
      : Array.from({ length: most + 1 }, (_, n) => most - n);
  let best: Pick | undefined;
  for (const n of counts) {
    const rest = bestFrom(big, index + 1, hands - n * slot.staff, fillers);
    const stones = rest.stones + n * slot.speed;
    if (best === undefined || moreStones(stones, best.stones)) {
      best = { stones, running: new Map(rest.running).set(slot.id, n) };
    }
  }
  return best ?? fill(fillers, hands);
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

/** One-hand machines, fastest first, as far as the hands go. */
function fill(fillers: readonly StaffSlot[], hands: number): Pick {
  const running = new Map<TierId, number>();
  let free = hands;
  let stones = 0;
  for (const filler of fillers) {
    const n = Math.min(filler.count, free);
    running.set(filler.id, n);
    free -= n;
    stones += n * filler.speed;
  }
  return { stones, running };
}

/**
 * The old rule, biggest machine first (#89): each kind runs as many as the
 * hands left can staff. `effectiveRates` weighs it with the others, so the
 * crew is never slower than it was.
 */
export function biggestFirst(
  slots: readonly StaffSlot[],
  hands: number,
): ReadonlyMap<TierId, number> {
  const running = new Map<TierId, number>();
  let free = Math.max(0, hands);
  for (const slot of slots) {
    const n = Math.min(slot.count, Math.floor(free / slot.staff));
    running.set(slot.id, n);
    free -= n * slot.staff;
  }
  return running;
}

/**
 * The staffing with `big` machines running and the one-hand machines
 * filled fastest first from the hands left, or undefined when the hands
 * or the machines owned are too few.
 */
export function staffWith(
  slots: readonly StaffSlot[],
  hands: number,
  big: ReadonlyMap<TierId, number>,
): ReadonlyMap<TierId, number> | undefined {
  let free = hands;
  for (const slot of slots) {
    const n = big.get(slot.id) ?? 0;
    if (slot.staff === 1 || n === 0) {
      continue;
    }
    if (n < 0 || n > slot.count) {
      return undefined;
    }
    free -= n * slot.staff;
  }
  if (free < 0) {
    return undefined;
  }
  const fillers = slots
    .filter((slot) => slot.staff === 1)
    .sort((a, b) => b.speed - a.speed);
  const running = new Map(fill(fillers, free).running);
  for (const slot of slots) {
    if (slot.staff > 1) {
      running.set(slot.id, big.get(slot.id) ?? 0);
    }
  }
  return running;
}

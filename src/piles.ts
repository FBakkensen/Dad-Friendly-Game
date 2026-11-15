/**
 * Stages and the piles between them (slice 1, rule 2 and rule 7, #703). The
 * rule, as Flemming widened it on 15 Nov 2026: "that is a general rule, not
 * only in the mine, each part is individual, and operates individual". Every
 * part of the game is its own unit with its own pile in front of it and its
 * own rate, and runs on its own. A part works while it has something in its
 * pile and room in the next one. It stops when its pile is empty or the next
 * pile is full, and it never waits on another part's rhythm.
 *
 * This module is the one place that moves goods through piles: the mine
 * (drilling, the drilled rock, haulage, the shaft pile, hoisting) and the
 * building site (transport, the site, the builders) both build a `Chain` and
 * call it. It moves totals; a caller that splits goods does so itself.
 */

/** What a pile holds now, and its room. A pile over its room is full (ruling 2). */
export type Pile = { readonly held: number; readonly holds: number };

/**
 * Stages in order, with one pile between each pair
 * (`piles.length === rates.length - 1`). `source` is what the first stage can
 * take: Infinity for the rock in the ground, or what the pocket holds for
 * transport. The last stage's output has no limit.
 */
export type Chain = {
  readonly source: number;
  readonly rates: readonly number[];
  readonly piles: readonly Pile[];
};

/** What a chain did over a stretch: each stage's total, each pile after, and the source left. */
export type ChainFlow = {
  readonly moved: readonly number[];
  readonly piles: readonly number[];
  readonly source: number;
};

/** Below this, a pile or the source is taken as at its edge (float noise between phases). */
const EDGE = 1e-9;

/** One forward pass: a stage whose pile in front is empty moves at most the stage before. */
function capForward(flows: number[], piles: readonly Pile[]): boolean {
  let changed = false;
  for (let index = 1; index < flows.length; index += 1) {
    const before = flows[index - 1] ?? 0;
    if ((piles[index - 1]?.held ?? 0) <= 0 && (flows[index] ?? 0) > before) {
      flows[index] = before;
      changed = true;
    }
  }
  return changed;
}

/**
 * One backward pass: a stage whose pile after it is full moves at most the
 * stage after it, and nothing while that pile is over its room.
 */
function capBackward(flows: number[], piles: readonly Pile[]): boolean {
  let changed = false;
  for (let index = flows.length - 2; index >= 0; index -= 1) {
    const next = piles[index];
    if (next === undefined || next.held < next.holds) {
      continue;
    }
    const cap = next.held > next.holds ? 0 : (flows[index + 1] ?? 0);
    if ((flows[index] ?? 0) > cap) {
      flows[index] = cap;
      changed = true;
    }
  }
  return changed;
}

/**
 * Each stage's rate now: its own rate, at most what the stage before brings
 * while the pile in front is empty, at most what the stage after takes while
 * the pile after is full, and nothing from a source that has run out.
 */
export function chainFlows(chain: Chain): readonly number[] {
  const flows = [...chain.rates];
  if (chain.source <= 0 && flows.length > 0) {
    flows[0] = 0;
  }
  // Each pass only lowers a flow to another flow, so this settles within a
  // pass per stage.
  for (let pass = 0; pass <= flows.length; pass += 1) {
    const forward = capForward(flows, chain.piles);
    const backward = capBackward(flows, chain.piles);
    if (!forward && !backward) {
      break;
    }
  }
  return flows;
}

/** Seconds until this pile fills, empties or comes down to its room at `net` a second. */
function pileChange(pile: Pile, net: number): number {
  if (net > 0 && pile.held < pile.holds) {
    return (pile.holds - pile.held) / net;
  }
  if (net < 0 && pile.held > pile.holds) {
    return (pile.held - pile.holds) / -net;
  }
  if (net < 0 && pile.held > 0) {
    return pile.held / -net;
  }
  return Infinity;
}

/** The soonest change at these flows: a pile at an edge, or the source run out. */
function changeAt(chain: Chain, flows: readonly number[]): number {
  const first = flows[0] ?? 0;
  let soonest =
    first > 0 && Number.isFinite(chain.source)
      ? chain.source / first
      : Infinity;
  for (const [index, pile] of chain.piles.entries()) {
    const net = (flows[index] ?? 0) - (flows[index + 1] ?? 0);
    soonest = Math.min(soonest, pileChange(pile, net));
  }
  return soonest;
}

/** Seconds until a flow changes (a pile fills or empties, or the source runs out), or Infinity. */
export function chainChange(chain: Chain): number {
  return changeAt(chain, chainFlows(chain));
}

/** `value`, set to `edge` when it is within float noise of it. */
function snap(value: number, edge: number): number {
  return Math.abs(value - edge) < EDGE ? edge : value;
}

/** The chain after `seconds` at constant `flows`, with each pile snapped to its edges. */
function advance(
  chain: Chain,
  flows: readonly number[],
  seconds: number,
): Chain {
  const piles = chain.piles.map((pile, index) => {
    const net = (flows[index] ?? 0) - (flows[index + 1] ?? 0);
    const held = snap(snap(pile.held + net * seconds, 0), pile.holds);
    return { held: Math.max(0, held), holds: pile.holds };
  });
  const source = Math.max(0, snap(chain.source - (flows[0] ?? 0) * seconds, 0));
  return { source, rates: chain.rates, piles };
}

/**
 * Phases are bounded: each one ends with a pile reaching an edge or the
 * source running out, and the flows only fall, apart from a pile over its
 * room coming down to it once.
 */
function phaseLimit(chain: Chain): number {
  return 8 * (chain.rates.length + 2);
}

/**
 * The chain over `seconds`, exact in real numbers: in phases, each at
 * constant flows until a pile fills or empties or the source runs out.
 */
export function flowChain(chain: Chain, seconds: number): ChainFlow {
  const moved = chain.rates.map(() => 0);
  let state = chain;
  let left = Math.max(0, seconds);
  for (let phase = 0; left > 0 && phase < phaseLimit(chain); phase += 1) {
    const flows = chainFlows(state);
    if (flows.every((flow) => flow <= 0)) {
      break;
    }
    const step = Math.min(left, changeAt(state, flows));
    for (const [index, flow] of flows.entries()) {
      moved[index] = (moved[index] ?? 0) + flow * step;
    }
    state = advance(state, flows, step);
    left -= step;
  }
  return {
    moved,
    piles: state.piles.map((pile) => pile.held),
    source: state.source,
  };
}

/**
 * The chain over `seconds` in whole goods (ruling 4): each stage's total is
 * floored, and each pile and the source are recomputed from those totals, so
 * nothing is made or lost. A part-good a call is dropped.
 */
export function flowWhole(chain: Chain, seconds: number): ChainFlow {
  const moved = flowChain(chain, seconds).moved.map((amount) =>
    Math.floor(amount + EDGE),
  );
  return {
    moved,
    piles: chain.piles.map(
      (pile, index) =>
        pile.held + (moved[index] ?? 0) - (moved[index + 1] ?? 0),
    ),
    source: chain.source - (moved[0] ?? 0),
  };
}

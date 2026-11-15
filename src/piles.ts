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
 *
 * A chain may name one pile that spills (#666): while it is full, what the
 * stage before brings beyond what the stage after takes bypasses to a side
 * pile, the way the rock the kilns cannot take goes to the stone stockpile.
 * The side pile has a room and a drain (what transport takes from it).
 */

/** What a pile holds now, and its room. A pile over its room is full (ruling 2). */
type Pile = { readonly held: number; readonly holds: number };

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
  readonly spill?: Spill;
};

/**
 * Where pile `from`'s overflow goes while that pile is full: a side pile
 * holding `held` of `holds`, drained at `drain` a second. A side pile that is
 * full takes no more than its drain, and one over its room takes nothing.
 */
export type Spill = Pile & { readonly from: number; readonly drain: number };

/**
 * What a chain did over a stretch: each stage's total, each pile after, the
 * source left, and what spilled to the side pile (0 with no spill).
 */
export type ChainFlow = {
  readonly moved: readonly number[];
  readonly piles: readonly number[];
  readonly source: number;
  readonly spilled: number;
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
function capBackward(
  flows: number[],
  piles: readonly Pile[],
  spill: Spill | undefined,
): boolean {
  let changed = false;
  for (let index = flows.length - 2; index >= 0; index -= 1) {
    const next = piles[index];
    if (next === undefined || next.held < next.holds) {
      continue;
    }
    const cap =
      (next.held > next.holds ? 0 : (flows[index + 1] ?? 0)) +
      (spill?.from === index ? spillRoom(spill) : 0);
    if ((flows[index] ?? 0) > cap) {
      flows[index] = cap;
      changed = true;
    }
  }
  return changed;
}

/** What a side pile takes a second: all while it has room, its drain while full, none over its room. */
function spillRoom(spill: Spill): number {
  if (spill.held < spill.holds) {
    return Infinity;
  }
  return spill.held > spill.holds ? 0 : spill.drain;
}

/**
 * What spills a second at these flows: nothing while the pile has room, what
 * the next stage cannot take while it is full, and all it is brought while it
 * is over its room.
 */
function spillIn(chain: Chain, flows: readonly number[]): number {
  const spill = chain.spill;
  const pile = spill === undefined ? undefined : chain.piles[spill.from];
  if (spill === undefined || pile === undefined || pile.held < pile.holds) {
    return 0;
  }
  const brought = flows[spill.from] ?? 0;
  return pile.held > pile.holds
    ? brought
    : Math.max(0, brought - (flows[spill.from + 1] ?? 0));
}

/** What leaves the side pile a second: its drain, or no more than comes in once it is empty. */
function spillOut(spill: Spill, coming: number): number {
  return spill.held > 0 ? spill.drain : Math.min(spill.drain, coming);
}

/** Each pile's net a second at these flows, with the spill taken out of its pile. */
function pileNets(chain: Chain, flows: readonly number[]): number[] {
  const spilled = spillIn(chain, flows);
  return chain.piles.map(
    (_, index) =>
      (flows[index] ?? 0) -
      (flows[index + 1] ?? 0) -
      (chain.spill?.from === index ? spilled : 0),
  );
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
    const backward = capBackward(flows, chain.piles, chain.spill);
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
  const nets = pileNets(chain, flows);
  for (const [index, pile] of chain.piles.entries()) {
    soonest = Math.min(soonest, pileChange(pile, nets[index] ?? 0));
  }
  if (chain.spill !== undefined) {
    const coming = spillIn(chain, flows);
    const net = coming - spillOut(chain.spill, coming);
    soonest = Math.min(soonest, pileChange(chain.spill, net));
  }
  return soonest;
}

/** What spills to the side pile a second now: 0 with no spill, or while its pile has room. */
export function chainSpill(chain: Chain): number {
  return spillIn(chain, chainFlows(chain));
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
  const nets = pileNets(chain, flows);
  const piles = chain.piles.map((pile, index) =>
    moved(pile, (nets[index] ?? 0) * seconds),
  );
  const source = Math.max(0, snap(chain.source - (flows[0] ?? 0) * seconds, 0));
  const spill = chain.spill;
  if (spill === undefined) {
    return { source, rates: chain.rates, piles };
  }
  const coming = spillIn(chain, flows);
  return {
    source,
    rates: chain.rates,
    piles,
    spill: {
      ...spill,
      ...moved(spill, (coming - spillOut(spill, coming)) * seconds),
    },
  };
}

/** The pile after `by` more, snapped to its edges. */
function moved(pile: Pile, by: number): Pile {
  const held = snap(snap(pile.held + by, 0), pile.holds);
  return { held: Math.max(0, held), holds: pile.holds };
}

/**
 * Phases are bounded: each one ends with a pile reaching an edge or the
 * source running out, and the flows only fall, apart from a pile over its
 * room coming down to it once.
 */
function phaseLimit(chain: Chain): number {
  return 8 * (chain.rates.length + (chain.spill === undefined ? 2 : 3));
}

/**
 * The chain over `seconds`, exact in real numbers: in phases, each at
 * constant flows until a pile fills or empties or the source runs out.
 */
export function flowChain(chain: Chain, seconds: number): ChainFlow {
  const totals = chain.rates.map(() => 0);
  let spilled = 0;
  let state = chain;
  let left = Math.max(0, seconds);
  for (let phase = 0; left > 0 && phase < phaseLimit(chain); phase += 1) {
    const flows = chainFlows(state);
    if (flows.every((flow) => flow <= 0)) {
      break;
    }
    const step = Math.min(left, changeAt(state, flows));
    for (const [index, flow] of flows.entries()) {
      totals[index] = (totals[index] ?? 0) + flow * step;
    }
    spilled += spillIn(state, flows) * step;
    state = advance(state, flows, step);
    left -= step;
  }
  return {
    moved: totals,
    piles: state.piles.map((pile) => pile.held),
    source: state.source,
    spilled,
  };
}

/**
 * The chain over `seconds` in whole goods (ruling 4): each stage's total is
 * floored, and each pile and the source are recomputed from those totals, so
 * nothing is made or lost. A part-good a call is dropped.
 */
export function flowWhole(chain: Chain, seconds: number): ChainFlow {
  const exact = flowChain(chain, seconds);
  const totals = exact.moved.map((amount) => Math.floor(amount + EDGE));
  const piles = chain.piles.map(
    (pile, index) =>
      pile.held + (totals[index] ?? 0) - (totals[index + 1] ?? 0),
  );
  const from = chain.spill?.from;
  // What spilled, in whole goods: the exact spill floored, and more only if
  // the pile would end above its room (or above what it held, when it was
  // over it), never more than the pile holds. So nothing is lost, and
  // nothing spills from a pile that still has room.
  let spilled = 0;
  if (from !== undefined) {
    const pile = chain.piles[from];
    const top = Math.max(pile?.holds ?? 0, pile?.held ?? 0);
    const whole = piles[from] ?? 0;
    spilled = Math.min(
      Math.max(0, whole),
      Math.max(Math.floor(exact.spilled + EDGE), whole - top),
    );
    piles[from] = whole - spilled;
  }
  return {
    moved: totals,
    piles,
    source: chain.source - (totals[0] ?? 0),
    spilled,
  };
}

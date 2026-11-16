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
 *
 * A stage may have a recipe (#723): it takes more than one of what is in its
 * pile for each it makes, the way a kiln takes two rock for one brick. Its
 * rate and its total are what it makes, and its pile goes down by its take
 * times that.
 *
 * Chains may run side by side (#673), the way the mine's levels do: each
 * `Branch` is a chain of its own, they share one stage's rate (hoisting)
 * evenly, and they spill to one side pile (the stone stockpile), each in
 * proportion to what it brings.
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
  /**
   * What each stage takes from the pile in front of it for each it makes: 1
   * when left out. A whole number, so whole goods stay whole.
   */
  readonly takes?: readonly number[];
};

/** What stage `index` takes from its pile for each it makes (#723). */
function takeOf(chain: Chain, index: number): number {
  return chain.takes?.[index] ?? 1;
}

/**
 * Where pile `from`'s overflow goes while that pile is full: a side pile
 * holding `held` of `holds`, drained at `drain` a second. A side pile that is
 * full takes no more than its drain, and one over its room takes nothing.
 */
type Spill = SidePile & { readonly from: number };

/** A side pile: what it holds, its room, and what drains it a second. */
type SidePile = Pile & { readonly drain: number };

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

/**
 * Whether the pile in front of stage `index` is empty for it: nothing in it,
 * or, for a stage with a recipe, too little for one whole good, so a
 * part-good's rock waits and never counts as a stage at work.
 */
function dryFor(chain: Chain, index: number): boolean {
  const held = chain.piles[index - 1]?.held ?? 0;
  const take = takeOf(chain, index);
  return take > 1 ? held < take - EDGE : held <= 0;
}

/**
 * One forward pass: a stage whose pile in front is empty makes at most what
 * the stage before brings, over its take.
 */
function capForward(flows: number[], chain: Chain): boolean {
  let changed = false;
  for (let index = 1; index < flows.length; index += 1) {
    const before = (flows[index - 1] ?? 0) / takeOf(chain, index);
    if (dryFor(chain, index) && (flows[index] ?? 0) > before) {
      flows[index] = before;
      changed = true;
    }
  }
  return changed;
}

/**
 * One backward pass: a stage whose pile after it is full moves at most what
 * the stage after it takes, and nothing while that pile is over its room.
 */
function capBackward(flows: number[], chain: Chain): boolean {
  let changed = false;
  const spill = chain.spill;
  for (let index = flows.length - 2; index >= 0; index -= 1) {
    const next = chain.piles[index];
    if (next === undefined || next.held < next.holds) {
      continue;
    }
    const cap =
      (next.held > next.holds ? 0 : taken(chain, flows, index + 1)) +
      (spill?.from === index ? spillRoom(spill) : 0);
    if ((flows[index] ?? 0) > cap) {
      flows[index] = cap;
      changed = true;
    }
  }
  return changed;
}

/** What stage `index` takes a second from the pile in front of it at these flows. */
function taken(chain: Chain, flows: readonly number[], index: number): number {
  return (flows[index] ?? 0) * takeOf(chain, index);
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
    : Math.max(0, brought - taken(chain, flows, spill.from + 1));
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
      taken(chain, flows, index + 1) -
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
    const forward = capForward(flows, chain);
    const backward = capBackward(flows, chain);
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

/**
 * The chain past every change in its first `within` seconds, and the seconds
 * from now the last of them came (#666). A stretch at least that long sees
 * those changes as made: a stockpile a few goods short of its room is full
 * for it, so the stretch ends at the next change after them, not a second on.
 */
export function chainSettled(
  chain: Chain,
  within: number,
): { readonly chain: Chain; readonly after: number } {
  let state = chain;
  let after = 0;
  for (let phase = 0; phase < phaseLimit(chain); phase += 1) {
    const flows = chainFlows(state);
    const next = changeAt(state, flows);
    if (after + next > within) {
      break;
    }
    state = advance(state, flows, next);
    after += next;
  }
  return { chain: state, after };
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
  const kept = chain.takes === undefined ? {} : { takes: chain.takes };
  if (spill === undefined) {
    return { source, rates: chain.rates, piles, ...kept };
  }
  const coming = spillIn(chain, flows);
  return {
    source,
    rates: chain.rates,
    piles,
    ...kept,
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
 * The chain over `seconds`, exact in real numbers, and the chain after it: in
 * phases, each at constant flows until a pile fills or empties or the source
 * runs out.
 */
function runChain(
  chain: Chain,
  seconds: number,
): { readonly flow: ChainFlow; readonly state: Chain } {
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
  const flow = {
    moved: totals,
    piles: state.piles.map((pile) => pile.held),
    source: state.source,
    spilled,
  };
  return { flow, state };
}

/** The chain over `seconds`, exact in real numbers (`runChain`). */
export function flowChain(chain: Chain, seconds: number): ChainFlow {
  return runChain(chain, seconds).flow;
}

/**
 * What more a side pile takes in whole goods than the `floored` exact spill
 * (#723): any while something drains it, as a drained stockpile's part-good
 * is taken on; with no drain, only its room left, and none over its room.
 */
function sideRoom(spill: Spill, floored: number): number {
  if (spill.held > spill.holds) {
    return 0;
  }
  if (spill.drain > 0) {
    return Infinity;
  }
  return Math.max(0, Math.floor(spill.holds - spill.held + EDGE) - floored);
}

/**
 * The chain over `seconds` in whole goods (ruling 4): each stage's total is
 * floored, and each pile and the source are recomputed from those totals, so
 * nothing is made or lost. A part-good a call is dropped.
 */
export function flowWhole(chain: Chain, seconds: number): ChainFlow {
  return wholeOf(chain, flowChain(chain, seconds));
}

/**
 * `exact`, what `chain` did in real numbers, in whole goods (`flowWhole`).
 * The chain's side pile is what is left of the real one's room.
 */
function wholeOf(chain: Chain, exact: ChainFlow): ChainFlow {
  const totals = exact.moved.map((amount) => Math.floor(amount + EDGE));
  const piles = chain.piles.map(
    (pile, index) =>
      pile.held + (totals[index] ?? 0) - taken(chain, totals, index + 1),
  );
  // What spilled, in whole goods: the exact spill floored, and more only if
  // the pile would end above its room (or above what it held, when it was
  // over it) and the side pile takes it, never more than the pile holds. So
  // nothing is lost, nothing spills from a pile that still has room, and a
  // full side pile that nothing drains never grows. What it cannot take
  // waits in the pile, over its room by less than one take (#723): a stage
  // with a recipe leaves the rock of a part-good there, and the full pile
  // holds the stage before it until that rock is taken.
  let spilled = 0;
  const spill = chain.spill;
  if (spill !== undefined) {
    const pile = chain.piles[spill.from];
    const top = Math.max(pile?.holds ?? 0, pile?.held ?? 0);
    const whole = piles[spill.from] ?? 0;
    const floored = Math.floor(exact.spilled + EDGE);
    spilled = Math.min(
      Math.max(0, whole),
      Math.max(
        floored,
        Math.min(whole - top, floored + sideRoom(spill, floored)),
      ),
    );
    piles[spill.from] = whole - spilled;
  }
  return {
    moved: totals,
    piles,
    source: chain.source - (totals[0] ?? 0),
    spilled,
  };
}

/**
 * `capacity` shared out evenly (the stockpiles' draw, and the shaft's
 * hoisting between levels, #673), in the order of `wants`: no share is above
 * its want, and what a want leaves goes evenly to the others. The smallest
 * wants are served first, so the rest is split among the larger.
 */
export function evenShares(
  capacity: number,
  wants: readonly number[],
): number[] {
  const shares = wants.map(() => 0);
  const order = wants.flatMap((want, index) => (want > 0 ? [index] : []));
  // Not `a - b`: two wants of Infinity are a tie, not NaN.
  order.sort((a, b) => ascending(wants[a] ?? 0, wants[b] ?? 0));
  let left = capacity;
  for (const [at, index] of order.entries()) {
    const take = Math.min(wants[index] ?? 0, left / (order.length - at));
    shares[index] = take;
    left -= take;
  }
  return shares;
}

/** -1, 0 or 1 as `a` is below, at or above `b`, Infinity included. */
function ascending(a: number, b: number): number {
  return Number(a > b) - Number(a < b);
}

/**
 * One of chains side by side (#673): a chain whose stage at the set's shared
 * stage takes a share of one rate, and whose pile `spillFrom` spills to the
 * set's one side pile.
 */
export type Branch = Omit<Chain, "spill"> & { readonly spillFrom: number };

/**
 * Chains side by side (#673): the levels of the mine, each with its own
 * stages and piles, sharing one rate at `shared.stage` (hoisting) and one side
 * pile (the stone stockpile). Each branch's own rate at that stage is ignored.
 */
export type Branches = {
  readonly branches: readonly Branch[];
  readonly shared: { readonly stage: number; readonly rate: number };
  readonly side: SidePile;
};

/** A side pile of no limit, to see what a branch would spill. */
const OPEN_SIDE: SidePile = { held: 0, holds: Infinity, drain: 0 };

/** The branch as a chain with `rate` at the shared stage, spilling to `side`. */
function branchAt(
  branch: Branch,
  stage: number,
  rate: number,
  side: SidePile,
): Chain {
  const { spillFrom, ...rest } = branch;
  const rates = [...rest.rates];
  rates[stage] = rate;
  return { ...rest, rates, spill: { from: spillFrom, ...side } };
}

/**
 * The part of `side` a branch spilling `weight` of the whole has: its room
 * and drain in proportion, so every part fills when the whole does.
 */
function sidePart(side: SidePile, weight: number): SidePile {
  return {
    held: side.held * weight,
    holds: side.holds === Infinity ? Infinity : side.holds * weight,
    drain: side.drain * weight,
  };
}

/**
 * The chains as they run until the next change (#673): the shared rate split
 * evenly by what each can take with all of it, and the side pile split by
 * what each would spill at its share.
 */
export function branchChains(set: Branches): readonly Chain[] {
  const { stage, rate } = set.shared;
  const wants = set.branches.map(
    (branch) => chainFlows(branchAt(branch, stage, rate, set.side))[stage] ?? 0,
  );
  const shares = evenShares(rate, wants);
  const spills = set.branches.map((branch, index) =>
    chainSpill(branchAt(branch, stage, shares[index] ?? 0, OPEN_SIDE)),
  );
  const total = spills.reduce((sum, spill) => sum + spill, 0);
  return set.branches.map((branch, index) => {
    const weight =
      total > 0 ? (spills[index] ?? 0) / total : 1 / set.branches.length;
    return branchAt(
      branch,
      stage,
      shares[index] ?? 0,
      sidePart(set.side, weight),
    );
  });
}

/** Seconds until a flow in any branch changes, or the side pile fills or empties, or Infinity. */
export function branchesChange(set: Branches): number {
  return Math.min(Infinity, ...branchChains(set).map(chainChange));
}

/** The phase bound for a set: each branch's, with its spill. */
function branchesPhaseLimit(set: Branches): number {
  return (
    8 * set.branches.reduce((sum, branch) => sum + branch.rates.length + 3, 0)
  );
}

/**
 * The side pile after each chain's part of it: their sum, snapped to its
 * edges. Parts all at their room are the whole at its room, and a side pile
 * within its room never ends over it for float noise.
 */
function sideAfter(side: SidePile, parts: readonly SidePile[]): SidePile {
  if (parts.every((part) => part.held === part.holds)) {
    return { ...side, held: side.holds };
  }
  const sum = parts.reduce((total, part) => total + part.held, 0);
  const held = moved({ held: sum, holds: side.holds }, 0).held;
  return {
    ...side,
    held: side.held <= side.holds ? Math.min(held, side.holds) : held,
  };
}

/** Each chain run `seconds` (within one phase), and the set after them. */
function stepBranches(
  set: Branches,
  chains: readonly Chain[],
  seconds: number,
): { readonly flows: readonly ChainFlow[]; readonly set: Branches } {
  const runs = chains.map((chain) => runChain(chain, seconds));
  const branches = set.branches.map((branch, index) => {
    const state = runs[index]?.state;
    return state === undefined
      ? branch
      : { ...branch, source: state.source, piles: state.piles };
  });
  const parts = runs.map((run) => run.state.spill ?? OPEN_SIDE);
  return {
    flows: runs.map((run) => run.flow),
    set: { ...set, branches, side: sideAfter(set.side, parts) },
  };
}

/**
 * The set past every change in its first `within` seconds, and the seconds
 * from now the last of them came (as `chainSettled`, #673).
 */
export function branchesSettled(
  set: Branches,
  within: number,
): { readonly set: Branches; readonly after: number } {
  let state = set;
  let after = 0;
  for (let phase = 0; phase < branchesPhaseLimit(set); phase += 1) {
    const chains = branchChains(state);
    const next = Math.min(Infinity, ...chains.map(chainChange));
    if (after + next > within) {
      break;
    }
    state = stepBranches(state, chains, next).set;
    after += next;
  }
  return { set: state, after };
}

/** `flow` added to `total`, stage by stage, with the piles and source after it. */
function addFlow(total: ChainFlow, flow: ChainFlow): ChainFlow {
  return {
    moved: total.moved.map(
      (amount, index) => amount + (flow.moved[index] ?? 0),
    ),
    piles: flow.piles,
    source: flow.source,
    spilled: total.spilled + flow.spilled,
  };
}

/** What a branch did before it moved: nothing. */
function stillFlow(branch: Branch): ChainFlow {
  return {
    moved: branch.rates.map(() => 0),
    piles: branch.piles.map((pile) => pile.held),
    source: branch.source,
    spilled: 0,
  };
}

/** Whether no stage of any chain moves. */
function allStill(chains: readonly Chain[]): boolean {
  return chains.every((chain) => chainFlows(chain).every((flow) => flow <= 0));
}

/**
 * The set over `seconds`, exact in real numbers: in phases, each split again
 * and every chain stepped by the least change.
 */
function runBranches(set: Branches, seconds: number): readonly ChainFlow[] {
  let totals = set.branches.map(stillFlow);
  let state = set;
  let left = Math.max(0, seconds);
  for (let phase = 0; left > 0 && phase < branchesPhaseLimit(set); phase += 1) {
    const chains = branchChains(state);
    if (allStill(chains)) {
      break;
    }
    const step = Math.min(left, ...chains.map(chainChange));
    const stepped = stepBranches(state, chains, step);
    totals = totals.map((total, index) => {
      const flow = stepped.flows[index];
      return flow === undefined ? total : addFlow(total, flow);
    });
    state = stepped.set;
    left -= step;
  }
  return totals;
}

/**
 * The set over `seconds` in whole goods (#673): one flow per branch, in
 * order, each as `flowWhole` floors a chain. A branch's spill takes no room
 * the side pile has already given the branches before it, nor what the
 * branches after it spill for certain (their exact spill floored), so with
 * no drain the side pile never ends over its room.
 */
export function flowBranchesWhole(
  set: Branches,
  seconds: number,
): readonly ChainFlow[] {
  const exact = runBranches(set, seconds);
  const floored = exact.map((flow) => Math.floor(flow.spilled + EDGE));
  const wholes: ChainFlow[] = [];
  let taken = 0;
  for (const [index, branch] of set.branches.entries()) {
    const flow = exact[index] ?? stillFlow(branch);
    const after = floored
      .slice(index + 1)
      .reduce((sum, amount) => sum + amount, 0);
    const room = { ...set.side, held: set.side.held + taken + after };
    const { stage, rate } = set.shared;
    const whole = wholeOf(branchAt(branch, stage, rate, room), flow);
    wholes.push(whole);
    taken += whole.spilled;
  }
  return wholes;
}

import type { Mountain } from "./mountain";
import { kilnRate, makerRate, makerTakes, type MakerId } from "./makers";
import { graniteOpen, type Granite, type GranitePileId } from "./mine-levels";
import {
  branchChains,
  branchesChange,
  branchesSettled,
  chainChange,
  chainFlows,
  chainSettled,
  chainSpill,
  flowBranchesWhole,
  flowWhole,
  type Branch,
  type Branches,
  type Chain,
  type ChainFlow,
} from "./piles";
import { effectiveRates, type Rates } from "./rates";
import { addedStock, type Stock } from "./stock";
import { stockpileRoom, stockyardOpen } from "./stockyard";
import { fleetRate, stockDraw } from "./transport";
import { lineWork, type LineWork } from "./workforce";

/**
 * The mine's piles (slice 1, rule 2, #703): drilled rock, between drilling
 * and haulage, and rock at the shaft, between haulage and hoisting. Each
 * stage works while it has rock in front of it and room after it, at its own
 * rate, and the chain in src/piles.ts moves the rock. A fresh mine only.
 *
 * Part 2 (#666) carries the chain on: what hoisting lifts goes to the rock at
 * the kilns while that pile has room, and bypasses to the stone stockpile when
 * it is full; the kilns make brick of it into the brick stockpile, two rock
 * for a brick by their recipe (#723). Each
 * stockpile holds the stockyard's room and is drained by what transport takes
 * from it, so a full stockyard stops the line. Before part 2 the kilns' pile
 * has no room and the stockpiles no limit: all that is lifted is stone.
 *
 * Part 3 (#673) adds the Granite once the shaft is sunk: a chain of its own
 * beside the Topsoil's (`Branches` in src/piles.ts), with its own drilling,
 * haulage, drilled rock and rock at the shaft, then the saws' pile, the saws
 * and the cut stone stockpile. The one hoist lifts from both levels' rock at
 * the shaft, and both bypass to the one stone stockpile. While the Granite is
 * not open, the mine is the Topsoil's chain alone, exactly as in part 2.
 */

/** The piles, by where the rock waits: the kilns' pile is part 2's (#666). */
export const PILE_IDS = ["face", "shaft", "kiln"] as const;

export type PileId = (typeof PILE_IDS)[number];

/** Rock in each pile, in whole stones. */
export type MinePiles = Readonly<Record<PileId, number>>;

/**
 * Each pile's room, as the lab set it (#703): a hundred seconds of the
 * lone worker's drilling, so his first stone comes up in under four
 * minutes and the casual dad raises the Light Tower's roof on day 2. A
 * larger room (500 and up) slows every player type's start. A pile over
 * its room is full and never emptied by a lower one (ruling 2), so this may
 * change with no version bump. The kilns' pile is the spec's guess, for the
 * lab to set (#667); it has room only while he owns a kiln.
 */
export const PILE_HOLDS: MinePiles = { face: 300, shaft: 300, kiln: 300 };

/**
 * The Granite's drilled rock and rock at the shaft (part 3, ruling 7): 300
 * each, as the Topsoil's. The saws' pile is a maker's (`makerHolds`).
 */
const GRANITE_PILE_HOLDS: Readonly<
  Record<Exclude<GranitePileId, "saw">, number>
> = { face: 300, shaft: 300 };

/** What the workforce moves on the mine's stages: the Topsoil's and the shaft's, and each level's own. */
type MineWork = Pick<LineWork, "stages" | "levels">;

/**
 * Each stage's own speed, kept per answer of `effectiveRates`: a night
 * builds the same mine's chain more than once a stretch, and that answer is
 * kept per mountain already (#314).
 */
const stageSpeeds = new WeakMap<Rates, MineWork>();

function stagesOf(mountain: Mountain): MineWork {
  const rates = effectiveRates(mountain);
  const kept = stageSpeeds.get(rates);
  if (kept !== undefined) {
    return kept;
  }
  const { stages, levels } = lineWork(mountain, rates.tierSpeed);
  const work = { stages, levels };
  stageSpeeds.set(rates, work);
  return work;
}

/**
 * A level's chain's stages, in order: drilling, haulage, hoisting, its maker
 * (the kilns, or the saws), and transport's take on what the maker makes.
 */
const LIFT = 2;
const MAKER = 3;
/** The stages that make something: the line and the maker. */
const MAKING = MAKER + 1;

/** A maker's pile's room (the rock at the kilns, or at the saws): none until he owns one. */
function makerHolds(mountain: Pick<Mountain, "makers">, id: MakerId): number {
  return mountain.makers[id] > 0 ? PILE_HOLDS.kiln : 0;
}

/** The kilns' pile's room: none until he owns a kiln. */
export function kilnHolds(mountain: Pick<Mountain, "makers">): number {
  return makerHolds(mountain, "kiln");
}

/** The Granite while it is open (part 3, the shaft sunk), else undefined: the mine is the Topsoil alone. */
type SunkGranite = Extract<Granite, { readonly kind: "sunk" }>;

function openGranite(mountain: Mountain): SunkGranite | undefined {
  return graniteOpen(mountain) && mountain.granite.kind === "sunk"
    ? mountain.granite
    : undefined;
}

/**
 * The mine as a chain: drilling, haulage and hoisting at their own speeds
 * times `pay`, with the face and shaft piles between them, then the kilns'
 * pile, the kilns and the brick stockpile, with the stone stockpile taking
 * what the kilns' pile cannot (#666). Drilling is 0 when `drilling` is false
 * (the night's clock has stopped it, rule 4). Transport's take is worked out
 * only once the stockyard is open: before it, nothing is full. A dry
 * stockpile gives transport what comes in (`takeIncome`). It is the Topsoil
 * alone, as part 2 has it, with the Granite open too: the screens read it
 * (#680), and the mine's work reads both levels (`flowMine`).
 */
export function mineChain(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): Chain {
  return stockyardOpen(mountain)
    ? chainWith(
        mountain,
        pay,
        drilling,
        stockDraw(mountain, pay, chainTake(mountain, pay, drilling)),
      )
    : chainWith(mountain, pay, drilling, {});
}

/**
 * The mine's two levels as chains side by side (part 3, #673), with
 * transport's take worked out as `mineChain` works it out for one.
 */
function levelsSet(
  mountain: Mountain,
  granite: SunkGranite,
  pay: number,
  drilling: boolean,
): Branches {
  return mineBranches(
    mountain,
    granite,
    { pay, drilling },
    stockyardOpen(mountain)
      ? stockDraw(mountain, pay, levelsTake(mountain, granite, pay, drilling))
      : {},
  );
}

/**
 * What each stockpile takes in a second while transport takes all it carries
 * from every full one (#666): what a dry stockpile can give transport. A full
 * brick stockpile drained that fast leaves the kilns all the rock they can
 * make into brick, so stone gets only what they cannot take, as it does once
 * the brick stockpile is below its room. Transport's take is worked out from
 * it, here and in `drawChange`.
 */
export function takeIncome(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): Partial<Stock> {
  const granite = openGranite(mountain);
  return granite === undefined
    ? chainTake(mountain, pay, drilling)
    : levelsTake(mountain, granite, pay, drilling);
}

/** `takeIncome` for the Topsoil alone. */
function chainTake(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): Partial<Stock> {
  const carry = fleetRate(mountain) * pay;
  return chainIncome(
    chainWith(mountain, pay, drilling, { stones: carry, brick: carry }),
  );
}

/** `takeIncome` for both levels: cut stone is carried as stone and brick are. */
function levelsTake(
  mountain: Mountain,
  granite: SunkGranite,
  pay: number,
  drilling: boolean,
): Partial<Stock> {
  const carry = fleetRate(mountain) * pay;
  return branchesIncome(
    mineBranches(
      mountain,
      granite,
      { pay, drilling },
      { stones: carry, brick: carry, cutStone: carry },
    ),
  );
}

/**
 * The Topsoil's level as one of chains side by side: drilling, haulage and
 * hoisting at their own speeds times `pay`, with the face and shaft piles
 * between them, then the kilns' pile, the kilns and the brick stockpile,
 * spilling from hoisting to the stone stockpile.
 */
function topsoilBranch(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
  draw: Partial<Stock>,
): Branch {
  const { stages } = stagesOf(mountain);
  return {
    source: Infinity,
    rates: [
      drilling ? stages.face * pay : 0,
      stages.haul * pay,
      stages.lift * pay,
      kilnRate(mountain) * pay,
      draw.brick ?? 0,
    ],
    piles: [
      { held: mountain.piles.face, holds: PILE_HOLDS.face },
      { held: mountain.piles.shaft, holds: PILE_HOLDS.shaft },
      { held: mountain.piles.kiln, holds: kilnHolds(mountain) },
      {
        held: mountain.stock.brick,
        holds: stockpileRoom(mountain, "brick"),
      },
    ],
    takes: chainTakes("kiln"),
    spillFrom: LIFT,
  };
}

/** The stone stockpile, drained at transport's take on stone: where every level's rock bypasses to. */
function stoneSide(mountain: Mountain, draw: Partial<Stock>): Branches["side"] {
  return {
    held: mountain.stock.stones,
    holds: stockpileRoom(mountain, "stones"),
    drain: draw.stones ?? 0,
  };
}

/** The mine's chain with transport taking `draw` a second from the stockpiles. `steadyIncome` builds the same chain steady. */
function chainWith(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
  draw: Partial<Stock>,
): Chain {
  const { spillFrom, ...chain } = topsoilBranch(mountain, pay, drilling, draw);
  return { ...chain, spill: { from: spillFrom, ...stoneSide(mountain, draw) } };
}

/**
 * The Granite's level as one of chains side by side (part 3, #673): its own
 * drilling and haulage, its drilled rock and rock at the shaft, then the
 * saws' pile, the saws and the cut stone stockpile. Its hoisting is the
 * set's shared rate.
 */
function graniteBranch(
  mountain: Mountain,
  granite: SunkGranite,
  { pay, drilling }: { readonly pay: number; readonly drilling: boolean },
  draw: Partial<Stock>,
): Branch {
  const { stages, levels } = stagesOf(mountain);
  const piles = granite.piles;
  return {
    source: Infinity,
    rates: [
      drilling ? levels.granite.face * pay : 0,
      levels.granite.haul * pay,
      stages.lift * pay,
      makerRate(mountain, "saw") * pay,
      draw.cutStone ?? 0,
    ],
    piles: [
      { held: piles.face, holds: GRANITE_PILE_HOLDS.face },
      { held: piles.shaft, holds: GRANITE_PILE_HOLDS.shaft },
      { held: piles.saw, holds: makerHolds(mountain, "saw") },
      {
        held: mountain.stock.cutStone,
        holds: stockpileRoom(mountain, "cutStone"),
      },
    ],
    takes: chainTakes("saw"),
    spillFrom: LIFT,
  };
}

/**
 * The mine's two levels side by side (part 3, #673, ruling 4): the Topsoil's
 * chain and the Granite's, sharing the one hoist's rate and the stone
 * stockpile, with transport taking `draw` a second from the stockpiles.
 * Drilling is 0 on both while `drilling` is false.
 */
function mineBranches(
  mountain: Mountain,
  granite: SunkGranite,
  run: { readonly pay: number; readonly drilling: boolean },
  draw: Partial<Stock>,
): Branches {
  return {
    branches: [
      topsoilBranch(mountain, run.pay, run.drilling, draw),
      graniteBranch(mountain, granite, run, draw),
    ],
    shared: { stage: LIFT, rate: stagesOf(mountain).stages.lift * run.pay },
    side: stoneSide(mountain, draw),
  };
}

/** Each stage's take: a maker takes its recipe's rock for each good (#723); a rock is a stone. */
function chainTakes(maker: MakerId): number[] {
  return [1, 1, 1, makerTakes(maker), 1];
}

/** A pile with no room: the stages around it run in step. */
const IN_STEP = { held: 0, holds: 0 } as const;

/**
 * What the mine brings each stockpile a second once it runs steady at full
 * output (#667): the same chain with no rock waiting and no stockpile full,
 * so the stages run in step, the kilns take what they can of what is lifted,
 * and the rest is stone. The lab's planner reads it, so it plans on the
 * split the chain itself makes. Its stages, piles, spill and takes are `chainWith`'s
 * in the same order: a change to one is a change to both.
 */
export function steadyIncome(mountain: Mountain): Partial<Stock> {
  const { stages } = stagesOf(mountain);
  return chainIncome({
    source: Infinity,
    rates: [stages.face, stages.haul, stages.lift, kilnRate(mountain), 0],
    piles: [IN_STEP, IN_STEP, IN_STEP, { held: 0, holds: Infinity }],
    spill: { from: LIFT, held: 0, holds: Infinity, drain: 0 },
    takes: chainTakes("kiln"),
  });
}

/** What a mine's chain brings to the stockpiles a second now: stone and brick. */
export function chainIncome(chain: Chain): Partial<Stock> {
  return {
    stones: chainSpill(chain),
    brick: chainFlows(chain)[MAKER] ?? 0,
  };
}

/**
 * What the mine's two levels bring to the stockpiles a second now (#673):
 * the stone both bypass, the Topsoil's brick and the Granite's cut stone.
 */
function branchesIncome(set: Branches): Partial<Stock> {
  const [topsoil, granite] = levelPair(branchChains(set));
  return {
    stones: chainSpill(topsoil) + chainSpill(granite),
    brick: chainFlows(topsoil)[MAKER] ?? 0,
    cutStone: chainFlows(granite)[MAKER] ?? 0,
  };
}

/** The Topsoil's and the Granite's, from a list in that order: one missing is a bug, never rock dropped. */
function levelPair<T>(items: readonly T[]): readonly [T, T] {
  const [topsoil, granite] = items;
  if (topsoil === undefined || granite === undefined) {
    throw new Error("mine-piles: a level is missing");
  }
  return [topsoil, granite];
}

/** Whether any stage of a mine's chain moves rock or makes its good now (transport's take aside). */
function chainMakes(chain: Chain): boolean {
  return chainFlows(chain)
    .slice(0, MAKING)
    .some((flow) => flow > 0);
}

/**
 * Whether any stage of the mine moves rock or makes a good now at `pay`, on
 * either level once the Granite is open: a mine where only the Granite works
 * still works.
 */
export function mineMakes(mountain: Mountain, pay: number): boolean {
  const granite = openGranite(mountain);
  return granite === undefined
    ? chainMakes(mineChain(mountain, pay, true))
    : branchChains(levelsSet(mountain, granite, pay, true)).some(chainMakes);
}

/** Whether any stage moves rock or makes a good now: it has something in front of it and room after it. */
export function mineMoves(mountain: Mountain): boolean {
  return mineMakes(mountain, 1);
}

/** Seconds until a stage's flow changes (a pile fills or empties), or Infinity. */
export function mineChange(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): number {
  const granite = openGranite(mountain);
  return granite === undefined
    ? chainChange(mineChain(mountain, pay, drilling))
    : branchesChange(levelsSet(mountain, granite, pay, drilling));
}

/**
 * The mine past every change in its first second (`chainSettled`, and
 * `branchesSettled` with both levels): what it brings the stockpiles a
 * second then, and the seconds from now until a flow changes after that.
 */
export function mineSettled(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): { readonly income: Partial<Stock>; readonly change: number } {
  const granite = openGranite(mountain);
  if (granite === undefined) {
    const settled = chainSettled(mineChain(mountain, pay, drilling), 1);
    return {
      income: chainIncome(settled.chain),
      change: settled.after + chainChange(settled.chain),
    };
  }
  const settled = branchesSettled(
    levelsSet(mountain, granite, pay, drilling),
    1,
  );
  return {
    income: branchesIncome(settled.set),
    change: settled.after + branchesChange(settled.set),
  };
}

/** What the mine did over a stretch: the mountain after, the rock hoisting lifted, and what reached the stockpiles. */
type MineFlow = {
  readonly mountain: Mountain;
  readonly mined: number;
  readonly gained: Partial<Stock>;
};

/**
 * The mine over `seconds`, in whole stones: rock moves through the piles,
 * what hoisting lifts goes to the kilns' pile or bypasses to stone, and the
 * kilns make brick (#666), all into the stock (the mountain stays full).
 * With the Granite open, both levels run side by side and the saws make cut
 * stone (#673). `mined` is the rock hoisting lifted, `gained` what reached
 * the stockpiles. A mine where nothing moves comes back as the same object.
 */
export function flowMine(
  mountain: Mountain,
  seconds: number,
  pay: number,
  drilling: boolean,
): MineFlow {
  const granite = openGranite(mountain);
  return granite === undefined
    ? flowTopsoil(mountain, seconds, pay, drilling)
    : flowLevels(
        mountain,
        granite,
        seconds,
        levelsSet(mountain, granite, pay, drilling),
      );
}

/** `flowMine` with the Topsoil alone: today's mine, part 1 and part 2 (ruling 6). */
function flowTopsoil(
  mountain: Mountain,
  seconds: number,
  pay: number,
  drilling: boolean,
): MineFlow {
  const flow = flowWhole(mineChain(mountain, pay, drilling), seconds);
  const dug = flow.moved[0] ?? 0;
  const mined = flow.moved[LIFT] ?? 0;
  const brick = flow.moved[MAKER] ?? 0;
  const stones = flow.spilled;
  const [face = 0, shaft = 0, kiln = 0] = flow.piles;
  const piles = mountain.piles;
  if (
    dug === 0 &&
    mined === 0 &&
    brick === 0 &&
    face === piles.face &&
    shaft === piles.shaft &&
    kiln === piles.kiln
  ) {
    return { mountain, mined: 0, gained: {} };
  }
  const gained = { stones, brick };
  return {
    mountain: {
      ...mountain,
      stock:
        stones === 0 && brick === 0
          ? mountain.stock
          : addedStock(mountain.stock, gained),
      piles: { face, shaft, kiln },
      rockDug: mountain.rockDug + dug,
    },
    mined,
    gained,
  };
}

/** Stage `index`'s total in a flow, 0 past its end. */
function movedAt(flow: ChainFlow, index: number): number {
  return flow.moved[index] ?? 0;
}

/** A level's three piles after a flow, in order: drilled rock, rock at the shaft, rock at its maker. */
function threePiles(flow: ChainFlow): readonly [number, number, number] {
  const [face = 0, shaft = 0, maker = 0] = flow.piles;
  return [face, shaft, maker];
}

/**
 * `flowMine` with both levels (#673): each level's drilling, piles and maker
 * on its own, the hoist's lift and the stone stockpile shared. The Topsoil's
 * piles go in `piles`, the Granite's in `granite.piles`.
 */
function flowLevels(
  mountain: Mountain,
  granite: SunkGranite,
  seconds: number,
  set: Branches,
): MineFlow {
  const [topsoil, deep] = levelPair(flowBranchesWhole(set, seconds));
  const dug = movedAt(topsoil, 0) + movedAt(deep, 0);
  const mined = movedAt(topsoil, LIFT) + movedAt(deep, LIFT);
  const gained = {
    stones: topsoil.spilled + deep.spilled,
    brick: movedAt(topsoil, MAKER),
    cutStone: movedAt(deep, MAKER),
  };
  const [face, shaft, kiln] = threePiles(topsoil);
  const [graniteFace, graniteShaft, saw] = threePiles(deep);
  const piles = { face, shaft, kiln };
  const granitePiles = { face: graniteFace, shaft: graniteShaft, saw };
  const still =
    dug === 0 &&
    mined === 0 &&
    gained.brick === 0 &&
    gained.cutStone === 0 &&
    samePiles(piles, mountain.piles) &&
    samePiles(granitePiles, granite.piles);
  if (still) {
    return { mountain, mined: 0, gained: {} };
  }
  return {
    mountain: {
      ...mountain,
      stock: addedStock(mountain.stock, gained),
      piles,
      granite: { ...granite, piles: granitePiles },
      rockDug: mountain.rockDug + dug,
    },
    mined,
    gained,
  };
}

/** Whether two sets of piles hold the same rock, pile by pile. */
function samePiles<K extends string>(
  left: Readonly<Record<K, number>>,
  right: Readonly<Record<K, number>>,
): boolean {
  return (Object.keys(left) as K[]).every((id) => left[id] === right[id]);
}

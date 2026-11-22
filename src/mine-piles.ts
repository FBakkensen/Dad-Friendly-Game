import {
  cagePileRoom,
  cageRates,
  shaftCages,
  tripSeconds,
  type CageRates,
  type ShaftCage,
} from "./cages";
import type { Mountain } from "./mountain";
import {
  kilnRate,
  makerBuffer,
  makerInputRoom,
  makerRate,
  makerTakes,
  type MakerId,
} from "./makers";
import {
  graniteOpen,
  openGranite,
  type GranitePiles,
  type MineLevelId,
  type SunkLevel,
} from "./mine-levels";
import { partThreeOn, slice2Part1On } from "./part-switch";
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
  stepQuota,
  turnPerLoad,
  type Branch,
  type Branches,
  type Chain,
  type ChainFlow,
} from "./piles";
import { crewTimer, effectiveRates, type Rates } from "./rates";
import { addedStock, type Stock } from "./stock";
import { stockpileRoom, stockyardOpen } from "./stockyard";
import { fleetRate, stockDraw } from "./transport";
import type { Stage, StageSpeeds } from "./line";
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
 * and the cut stone stockpile. The shaft's cages (src/cages.ts, #724) lift
 * from both levels' rock at the shaft, counted here as rates (rule 5.14):
 * each level its own cages', and the cages for both in turn. Both bypass to
 * the one stone stockpile. While the Granite is not open, the mine is the
 * Topsoil's chain alone, as in part 2, with every cage serving the Topsoil
 * once part 3 is on; with part 3 off, hoisting's workers lift it, as today.
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
 * The Granite's drilled rock (part 3, ruling 7): 300, as the Topsoil's
 * (`faceHolds`). Its rock at the shaft is the cages' (`shaftHolds`), and the
 * saws' pile a maker's (`makerHolds`).
 */
const GRANITE_FACE_HOLDS = 300;

/**
 * What the workforce moves on the mine's stages (the Topsoil's and the
 * shaft's, and each level's own), and, while part 3 is on, the shaft's cages
 * at pay 1 and what they lift a second as rates (#724). With part 3 off the
 * cages are none and `lift` is undefined: hoisting's workers lift, as today.
 */
type MineWork = {
  readonly stages: StageSpeeds;
  readonly levels: LineWork["levels"];
  readonly cages: readonly ShaftCage[];
  readonly lift: CageRates | undefined;
};

/**
 * The mine's work, kept per answer of `effectiveRates`: a night builds the
 * same mine's chain more than once a stretch, and that answer is kept per
 * mountain already (#314). The cages are worked out here once, and only
 * while part 3 is on.
 */
const mineWorks = new WeakMap<Rates, MineWork>();

export function mineWork(mountain: Mountain): MineWork {
  const rates = effectiveRates(mountain);
  const kept = mineWorks.get(rates);
  if (kept !== undefined) {
    return kept;
  }
  const { stages, levels, hoisting } = lineWork(mountain, rates.tierSpeed);
  const cagesPlay = partThreeOn();
  const cages = cagesPlay
    ? shaftCages({
        owned: mountain.owned,
        hoisting,
        speed: rates.tierSpeed,
        assigned: mountain.cages.assigned,
        twoLevels: graniteOpen(mountain),
        pay: 1,
      })
    : [];
  const work: MineWork = {
    stages,
    levels,
    cages,
    lift: cagesPlay ? cageRates(cages) : undefined,
  };
  mineWorks.set(rates, work);
  return work;
}

/**
 * The room of a pile the cages use (ruling 7): from part 3, a load of the
 * largest cage, the winch's among them, for every cage in the shaft and
 * never fewer than three (`cagePileRoom`), never less than `base`; before
 * it, `base`.
 */
function cageUsedRoom(mountain: Mountain, base: number): number {
  return partThreeOn() ? cagePileRoom(base, mineWork(mountain).cages) : base;
}

/** The rock at the shaft's room, on both levels: 300, and from part 3 a load of his largest cage for each cage, at least three. */
export function shaftHolds(mountain: Mountain): number {
  return cageUsedRoom(mountain, PILE_HOLDS.shaft);
}

/** The drilled rock's room on a level: 300 on both, whatever the cages (ruling 7). */
export function faceHolds(level: MineLevelId): number {
  return level === "topsoil" ? PILE_HOLDS.face : GRANITE_FACE_HOLDS;
}

/**
 * A level's chain's stages, in order: drilling, haulage, hoisting, its maker
 * (the kilns, or the saws), and transport's take on what the maker makes.
 */
const LIFT = 2;
const MAKER = 3;
/** The stages that make something: the line and the maker. */
const MAKING = MAKER + 1;

/**
 * A maker's pile's room (the rock at the kilns, or at the saws): none until
 * he owns one, then 300, and from part 3 a load of his largest cage for
 * each cage, at least three.
 */
export function makerHolds(mountain: Mountain, id: MakerId): number {
  return mountain.makers[id] > 0 ? cageUsedRoom(mountain, PILE_HOLDS.kiln) : 0;
}

/** The kilns' pile's room: none until he owns a kiln. */
export function kilnHolds(mountain: Mountain): number {
  return makerHolds(mountain, "kiln");
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
 * What transport takes a second from each stockpile while the mine runs
 * (#666): `stockDraw` from what the mine can give it (`takeIncome`), on both
 * levels once the Granite is open. Nothing while the stockyard is shut.
 */
export function mineDraw(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): Partial<Stock> {
  return stockyardOpen(mountain)
    ? stockDraw(mountain, pay, takeIncome(mountain, pay, drilling))
    : {};
}

/**
 * The mine's two levels as chains side by side (part 3, #673), with
 * transport's take worked out as `mineChain` works it out for one.
 */
function levelsSet(
  mountain: Mountain,
  granite: SunkLevel,
  pay: number,
  drilling: boolean,
): Branches {
  return mineBranches(
    mountain,
    granite,
    { pay, drilling },
    mineDraw(mountain, pay, drilling),
  );
}

/**
 * Each level's chain as the mine runs it now at pay 1 (#680): with the
 * Granite shut, `mineChain`; with it open, the Topsoil's and the Granite's
 * side by side, each hoisting its own cages and its share of the turn.
 */
function levelChains(mountain: Mountain): readonly Chain[] {
  const granite = openGranite(mountain);
  return granite === undefined
    ? [mineChain(mountain, 1, true)]
    : branchChains(levelsSet(mountain, granite, 1, true));
}

/**
 * The Topsoil's chain now (#680): what reaches the kilns and the stone
 * stockpile, which the refinery reads. With two levels the Granite's lifted
 * rock goes to the saws, and the Topsoil hoists its share of the turn too.
 */
export function topsoilChain(mountain: Mountain): Chain {
  const [topsoil] = levelChains(mountain);
  if (topsoil === undefined) {
    throw new Error("mine-piles: the mine has no Topsoil");
  }
  return topsoil;
}

/**
 * The Granite's chain now (#754): what reaches the saws and the stone
 * stockpile, which the refinery reads. With one level there is none.
 */
export function graniteChain(mountain: Mountain): Chain | undefined {
  return levelChains(mountain)[1];
}

/**
 * What a level's stages move a second: its drilling and haulage, and what
 * hoisting lifts from it (the Topsoil's to the kilns and the stone
 * stockpile, the Granite's to the saws).
 */
type LevelFlow = {
  readonly face: number;
  readonly haul: number;
  readonly lift: number;
};

/** A level's flow from its chain's flows: 0 for a stage past its end. */
function levelFlow(flows: readonly number[]): LevelFlow {
  return { face: flows[0] ?? 0, haul: flows[1] ?? 0, lift: flows[LIFT] ?? 0 };
}

function makerDrainCap(
  mountain: Mountain,
  id: MakerId,
  inputId: "topsoilRock" | "graniteRock",
  outGood: "brick" | "cutStone",
  fleet: number,
): number {
  if (mountain.makers[id] <= 0) {
    return 0;
  }
  if (makerInputRoom(mountain, id) > makerBuffer(mountain, id, inputId)) {
    return fleet;
  }
  return stockpileRoom(mountain, outGood) > mountain.stock[outGood]
    ? makerRate(mountain, id) * makerTakes(id)
    : 0;
}

/** Pithead drain capacity per open level under Slice 2 Part 1 (used by mineLevelFlows / mineMakes). */
function slice2PitheadDrain(mountain: Mountain): {
  readonly topsoil: number;
  readonly granite: number;
} {
  const fleet = fleetRate(mountain);
  if (fleet <= 0) {
    return { topsoil: 0, granite: 0 };
  }
  const stoneRoom = stockpileRoom(mountain, "stones") > mountain.stock.stones;
  const kilnCap = makerDrainCap(
    mountain,
    "kiln",
    "topsoilRock",
    "brick",
    fleet,
  );
  const sawCap = graniteOpen(mountain)
    ? makerDrainCap(mountain, "saw", "graniteRock", "cutStone", fleet)
    : 0;
  const topCap = stoneRoom ? fleet : Math.min(fleet, kilnCap);
  const granCap = graniteOpen(mountain)
    ? stoneRoom
      ? fleet
      : Math.min(fleet, sawCap)
    : 0;
  if (topCap > 0 && granCap > 0 && topCap + granCap > fleet) {
    const half = fleet / 2;
    return {
      topsoil: Math.min(topCap, half) + Math.max(0, half - granCap),
      granite: Math.min(granCap, half) + Math.max(0, half - topCap),
    };
  }
  return { topsoil: topCap, granite: granCap };
}

/**
 * What the mine moves now through the piles, a second, at pay 1 and under
 * the crew timer (#680): each level's drilling, haulage and what hoisting
 * lifts from it, and the shaft's hoisting from both. With the Granite shut the Granite's are 0, and the
 * Topsoil's are `mineChain`'s.
 */
export function mineLevelFlows(mountain: Mountain): {
  readonly levels: Readonly<Record<MineLevelId, LevelFlow>>;
  readonly lift: number;
} {
  const timer = crewTimer();
  if (slice2Part1On()) {
    const chains = undergroundPitheadChains(
      mountain,
      1,
      true,
      slice2PitheadDrain(mountain),
    );
    const topsoil =
      chains.topsoil === undefined
        ? levelFlow([])
        : levelFlow(chainFlows(chains.topsoil).map((flow) => flow * timer));
    const deep =
      chains.granite === undefined
        ? levelFlow([])
        : levelFlow(chainFlows(chains.granite).map((flow) => flow * timer));
    return {
      levels: { topsoil, granite: deep },
      lift: topsoil.lift + deep.lift,
    };
  }
  const [topsoil = levelFlow([]), deep = levelFlow([])] = levelChains(
    mountain,
  ).map((chain) => levelFlow(chainFlows(chain).map((flow) => flow * timer)));
  return {
    levels: { topsoil, granite: deep },
    lift: topsoil.lift + deep.lift,
  };
}

/**
 * What one load of the cages for both lifts a second now (#680): a load
 * from each level in the turn once a round of their trips (`turnPerLoad`),
 * as the night counts it. With the Granite shut there is no turn: 0.
 */
export function mineTurnPerLoad(mountain: Mountain): number {
  const granite = openGranite(mountain);
  return granite === undefined
    ? 0
    : turnPerLoad(levelsSet(mountain, granite, 1, true));
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
  granite: SunkLevel,
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
 * spilling from hoisting to the stone stockpile. From part 3 its hoisting is
 * its own cages' (rule 5.14): every cage with the Topsoil alone, and those
 * assigned to it with the Granite open.
 */
function topsoilBranch(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
  draw: Partial<Stock>,
): Branch {
  const { stages, lift } = mineWork(mountain);
  return {
    source: Infinity,
    rates: [
      drilling ? stages.face * pay : 0,
      stages.haul * pay,
      (lift?.own.topsoil ?? stages.lift) * pay,
      kilnRate(mountain) * pay,
      draw.brick ?? 0,
    ],
    piles: [
      { held: mountain.piles.face, holds: faceHolds("topsoil") },
      { held: mountain.piles.shaft, holds: shaftHolds(mountain) },
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
 * saws' pile, the saws and the cut stone stockpile. Its own hoisting is
 * its assigned cages' (#724), and it lifts its share of the set's turn.
 */
function graniteBranch(
  mountain: Mountain,
  granite: SunkLevel,
  { pay, drilling }: { readonly pay: number; readonly drilling: boolean },
  draw: Partial<Stock>,
): Branch {
  const { levels, lift } = mineWork(mountain);
  const piles = granite.piles;
  return {
    source: Infinity,
    rates: [
      drilling ? levels.granite.face * pay : 0,
      levels.granite.haul * pay,
      (lift?.own.granite ?? 0) * pay,
      makerRate(mountain, "saw") * pay,
      draw.cutStone ?? 0,
    ],
    piles: [
      { held: piles.face, holds: faceHolds("granite") },
      { held: piles.shaft, holds: shaftHolds(mountain) },
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
 * The mine's two levels side by side (part 3, #673): the Topsoil's chain and
 * the Granite's, sharing the stone stockpile, with transport taking `draw` a
 * second from the stockpiles. Drilling is 0 on both while `drilling` is
 * false. Each level lifts its own cages' rate, and the cages for both lift
 * their loads once a round of the trips of the levels in the turn, strictly
 * in turn (ruling 6, rule 5.14).
 */
function mineBranches(
  mountain: Mountain,
  granite: SunkLevel,
  run: { readonly pay: number; readonly drilling: boolean },
  draw: Partial<Stock>,
): Branches {
  return {
    branches: [
      topsoilBranch(mountain, run.pay, run.drilling, draw),
      graniteBranch(mountain, granite, run, draw),
    ],
    shared: {
      stage: LIFT,
      turn: {
        loads: (mineWork(mountain).lift?.loads ?? 0) * run.pay,
        trips: [tripSeconds("topsoil"), tripSeconds("granite")],
      },
    },
    side: stoneSide(mountain, draw),
  };
}

/** Each stage's take: a maker takes its recipe's rock for each good (#723); a rock is a stone. */
function chainTakes(maker: MakerId): number[] {
  return [1, 1, 1, makerTakes(maker), 1];
}

/** A pile with no room: the stages around it run in step. */
const IN_STEP = { held: 0, holds: 0 } as const;

/** A stockpile or side pile with no limit: nothing is full in the steady line. */
const OPEN = { held: 0, holds: Infinity } as const;

/**
 * A level's branch run steady (#667, #675): no rock waiting, no stockpile
 * full and nothing drawn, so the stages run in step at full output.
 */
function steadied(branch: Branch): Branch {
  return {
    ...branch,
    rates: branch.rates.map((rate, index) =>
      index === branch.rates.length - 1 ? 0 : rate,
    ),
    piles: [IN_STEP, IN_STEP, IN_STEP, OPEN],
  };
}

/**
 * The mine's levels run steady (#675): the Topsoil's chain alone while the
 * Granite is shut, else both branches with the cages for both in turn, as
 * `mineBranches` runs them. `steadyIncome` and `steadyLevels` read it.
 */
function steadyChains(mountain: Mountain): readonly Chain[] {
  const side = { ...OPEN, drain: 0 };
  const topsoil = steadied(topsoilBranch(mountain, 1, true, {}));
  const granite = openGranite(mountain);
  if (granite === undefined) {
    const { spillFrom, ...chain } = topsoil;
    return [{ ...chain, spill: { from: spillFrom, ...side } }];
  }
  const set = mineBranches(mountain, granite, { pay: 1, drilling: true }, {});
  return branchChains({
    ...set,
    branches: set.branches.map(steadied),
    side,
  });
}

/**
 * What the mine brings each stockpile a second once it runs steady at full
 * output (#667): the same chains with no rock waiting and no stockpile full,
 * so the stages run in step, the kilns and the saws take what they can of
 * what is lifted, and the rest is stone. From part 3 hoisting is the cages'
 * rates (#675), and with the Granite open both levels count. The lab's
 * planner reads it, so it plans on the split the chain itself makes. Its
 * stages, piles, spill and takes are `topsoilBranch`'s and `graniteBranch`'s:
 * a change to one is a change to both.
 */
export function steadyIncome(mountain: Mountain): Partial<Stock> {
  const chains = steadyChains(mountain);
  const [topsoil, granite] = chains;
  if (topsoil === undefined) {
    throw new Error("mine-piles: a level is missing");
  }
  return granite === undefined
    ? chainIncome(topsoil)
    : {
        stones: chainSpill(topsoil) + chainSpill(granite),
        brick: chainFlows(topsoil)[MAKER] ?? 0,
        cutStone: chainFlows(granite)[MAKER] ?? 0,
      };
}

/** A level's three stages' rates, the line's own. */
export type LevelRates = Readonly<Record<Stage, number>>;

const SHUT: LevelRates = { face: 0, haul: 0, lift: 0 };

/**
 * Each level's drilling, haulage and hoisting rates in the steady line
 * (#675): hoisting is what the cages lift from that level, its own cages and
 * its share of the turn. The Granite's are 0 while it is shut. The lab's dad
 * raises a level's slowest stage.
 */
export function steadyLevels(
  mountain: Mountain,
): Readonly<Record<MineLevelId, LevelRates>> {
  const [topsoil, granite] = steadyChains(mountain).map(
    (chain): LevelRates => ({
      face: chain.rates[0] ?? 0,
      haul: chain.rates[1] ?? 0,
      lift: chain.rates[LIFT] ?? 0,
    }),
  );
  return { topsoil: topsoil ?? SHUT, granite: granite ?? SHUT };
}

/** What a level's maker makes a second now: the Topsoil's brick, the Granite's cut stone. */
export function chainMade(chain: Chain): number {
  return chainFlows(chain)[MAKER] ?? 0;
}

/** What a mine's chain brings to the stockpiles a second now: stone and brick. */
function chainIncome(chain: Chain): Partial<Stock> {
  return {
    stones: chainSpill(chain),
    brick: chainMade(chain),
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
    brick: chainMade(topsoil),
    cutStone: chainMade(granite),
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
  if (slice2Part1On()) {
    const drain = slice2PitheadDrain(mountain);
    const chains = undergroundPitheadChains(mountain, pay, true, {
      topsoil: drain.topsoil * pay,
      granite: drain.granite * pay,
    });
    const mineActive = [chains.topsoil, chains.granite].some(
      (chain) => chain !== undefined && chainFlows(chain).some((f) => f > 0),
    );
    if (mineActive) {
      return true;
    }
    const kilnActive =
      makerRate(mountain, "kiln") * pay > 0 &&
      makerBuffer(mountain, "kiln", "topsoilRock") >= makerTakes("kiln") &&
      stockpileRoom(mountain, "brick") > mountain.stock.brick;
    const sawActive =
      graniteOpen(mountain) &&
      makerRate(mountain, "saw") * pay > 0 &&
      makerBuffer(mountain, "saw", "graniteRock") >= makerTakes("saw") &&
      stockpileRoom(mountain, "cutStone") > mountain.stock.cutStone;
    return kilnActive || sawActive;
  }
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
export type MineFlow = {
  readonly mountain: Mountain;
  readonly mined: number;
  readonly gained: Partial<Stock>;
};

/**
 * What a step of the mine moved and left (rates or cages, #724): the rock
 * drilled on each level, the rock lifted, what reached the stockpiles, and
 * every pile after it. `granitePiles` is the Granite's, while it is open.
 */
export type MineStep = {
  readonly dug: Readonly<Record<MineLevelId, number>>;
  readonly mined: number;
  readonly gained: Partial<Stock>;
  readonly piles: MinePiles;
  readonly granitePiles: GranitePiles | undefined;
};

/** Whether a step moved nothing: no rock drilled or lifted, no good made, and every pile as it was. */
function stood(
  mountain: Mountain,
  granite: SunkLevel | undefined,
  step: MineStep,
): boolean {
  return (
    step.dug.topsoil === 0 &&
    step.dug.granite === 0 &&
    step.mined === 0 &&
    Object.values(step.gained).every((amount) => amount === 0) &&
    samePiles(step.piles, mountain.piles) &&
    (granite === undefined ||
      step.granitePiles === undefined ||
      samePiles(step.granitePiles, granite.piles))
  );
}

/**
 * The mine's write-back after a step, for rates and live play alike
 * (`mine-cages`): the piles, the Granite's piles while it is open, the stock
 * and rock dug. A step that moved nothing gives the same mountain back.
 */
export function mineWritten(mountain: Mountain, step: MineStep): MineFlow {
  const granite = openGranite(mountain);
  if (stood(mountain, granite, step)) {
    return { mountain, mined: 0, gained: {} };
  }
  const { gained } = step;
  return {
    mountain: {
      ...mountain,
      stock: Object.values(gained).every((amount) => amount === 0)
        ? mountain.stock
        : addedStock(mountain.stock, gained),
      piles: step.piles,
      mineLevels:
        granite === undefined || step.granitePiles === undefined
          ? mountain.mineLevels
          : {
              ...mountain.mineLevels,
              granite: { ...granite, piles: step.granitePiles },
            },
      rockDug: mountain.rockDug + step.dug.topsoil + step.dug.granite,
    },
    mined: step.mined,
    gained,
  };
}

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
  const [face, shaft, kiln] = threePiles(flow);
  return mineWritten(mountain, {
    dug: { topsoil: movedAt(flow, 0), granite: 0 },
    mined: movedAt(flow, LIFT),
    gained: { stones: flow.spilled, brick: movedAt(flow, MAKER) },
    piles: { face, shaft, kiln },
    granitePiles: undefined,
  });
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
 * on its own, the cages' lift and the stone stockpile shared. The Topsoil's
 * piles go in `piles`, the Granite's in `granite.piles`.
 */
function flowLevels(
  mountain: Mountain,
  seconds: number,
  set: Branches,
): MineFlow {
  const [topsoil, deep] = levelPair(flowBranchesWhole(set, seconds));
  const [face, shaft, kiln] = threePiles(topsoil);
  const [graniteFace, graniteShaft, saw] = threePiles(deep);
  return mineWritten(mountain, {
    dug: { topsoil: movedAt(topsoil, 0), granite: movedAt(deep, 0) },
    mined: movedAt(topsoil, LIFT) + movedAt(deep, LIFT),
    gained: {
      stones: topsoil.spilled + deep.spilled,
      brick: movedAt(topsoil, MAKER),
      cutStone: movedAt(deep, MAKER),
    },
    piles: { face, shaft, kiln },
    granitePiles: { face: graniteFace, shaft: graniteShaft, saw },
  });
}

/** Whether two sets of piles hold the same rock, pile by pile. */
function samePiles<K extends string>(
  left: Readonly<Record<K, number>>,
  right: Readonly<Record<K, number>>,
): boolean {
  return (Object.keys(left) as K[]).every((id) => left[id] === right[id]);
}

// ---------------------------------------------------------------------------
// Slice 2 Part 1: pithead buffers & underground chains (zero Stone bypass)

/** Minimum pithead rock buffer room before Hoist #1 (spec rule 1.4, #766). */
export const MIN_PITHEAD_ROOM = 300;

/**
 * Room of each open level's pithead rock buffer (spec rule 1.4, #766):
 * uses `cagePileRoom` with `MIN_PITHEAD_ROOM` so live cages never fall behind
 * offline rates past 3 cages while winches still hold at least 300 rock.
 */
export function pitheadRoom(mountain: Mountain): number {
  return cageUsedRoom(mountain, MIN_PITHEAD_ROOM);
}

const NO_SIDE: Branches["side"] = { held: 0, holds: 0, drain: 0 };

/** Discretizes underground stage rates (drill, haul, lift) for one 1 s tick. */
function discretePitheadChain(chain: Chain, tickIndex: number): Chain {
  return {
    ...chain,
    rates: [
      stepQuota(chain.rates[0] ?? 0, tickIndex),
      stepQuota(chain.rates[1] ?? 0, tickIndex),
      stepQuota(chain.rates[2] ?? 0, tickIndex),
      chain.rates[3] ?? 0,
    ],
  };
}

/** One level's underground branch into its pithead buffer, drained by transport at `drain`. */
function pitheadBranch(
  mountain: Mountain,
  level: MineLevelId,
  { pay, drilling }: { readonly pay: number; readonly drilling: boolean },
  drain: number,
): Branch {
  const { levels, lift } = mineWork(mountain);
  const granite = openGranite(mountain);
  const faceHeld =
    level === "topsoil" ? mountain.piles.face : (granite?.piles.face ?? 0);
  const shaftHeld =
    level === "topsoil" ? mountain.piles.shaft : (granite?.piles.shaft ?? 0);
  return {
    source: Infinity,
    rates: [
      drilling ? levels[level].face * pay : 0,
      levels[level].haul * pay,
      (lift?.own[level] ?? 0) * pay,
      drain,
    ],
    piles: [
      { held: faceHeld, holds: faceHolds(level) },
      { held: shaftHeld, holds: shaftHolds(mountain) },
      { held: mountain.pithead[level], holds: pitheadRoom(mountain) },
    ],
    spillFrom: LIFT,
  };
}

/** Underground mine branches into pithead buffers, with shared cage turn and zero spill. */
function undergroundPitheadSet(
  mountain: Mountain,
  run: { readonly pay: number; readonly drilling: boolean },
  pitheadDrain: Readonly<Record<MineLevelId, number>>,
): Branches {
  return {
    branches: [
      pitheadBranch(mountain, "topsoil", run, pitheadDrain.topsoil),
      pitheadBranch(mountain, "granite", run, pitheadDrain.granite),
    ],
    shared: {
      stage: LIFT,
      turn: {
        loads: (mineWork(mountain).lift?.loads ?? 0) * run.pay,
        trips: [tripSeconds("topsoil"), tripSeconds("granite")],
      },
    },
    side: NO_SIDE,
  };
}

/**
 * Instantaneous underground chains into pithead buffers (Slice 2, #766):
 * Topsoil alone when Granite is unsunk, else both sharing the cage turn.
 * Zero bypass to stone or makers.
 */
export function undergroundPitheadChains(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
  pitheadDrain: Readonly<Record<MineLevelId, number>>,
): Readonly<Partial<Record<MineLevelId, Chain>>> {
  const granite = openGranite(mountain);
  if (granite === undefined) {
    const branch = pitheadBranch(
      mountain,
      "topsoil",
      { pay, drilling },
      pitheadDrain.topsoil,
    );
    return {
      topsoil: {
        source: branch.source,
        rates: branch.rates,
        piles: branch.piles,
      },
    };
  }
  const [topsoil, deep] = levelPair(
    branchChains(
      undergroundPitheadSet(mountain, { pay, drilling }, pitheadDrain),
    ),
  );
  return { topsoil, granite: deep };
}

/** Outcome of advancing the underground mine into pithead buffers over `seconds`. */
export type PitheadFlow = {
  readonly mountain: Mountain;
  readonly hoisted: Readonly<Record<MineLevelId, number>>;
};

/**
 * Advances underground drilling, haulage, and hoisting into `pithead[level]`
 * over `seconds` whole seconds (Slice 2 offline/rate stepping, #766).
 * Returns the updated mountain with `hoisted[level]` added into `pithead[level]`
 * (transport drains it in the coupled step).
 */
export function flowUndergroundToPithead(
  mountain: Mountain,
  seconds: number,
  pay: number,
  drilling: boolean,
  pitheadDrain: Readonly<Record<MineLevelId, number>>,
  tickIndex?: number,
): PitheadFlow {
  const discreteTick = seconds === 1 ? tickIndex : undefined;
  const granite = openGranite(mountain);
  if (granite === undefined) {
    const branch = pitheadBranch(
      mountain,
      "topsoil",
      { pay, drilling },
      pitheadDrain.topsoil,
    );
    const baseChain: Chain = {
      source: branch.source,
      rates: branch.rates,
      piles: branch.piles,
    };
    const chain =
      discreteTick === undefined
        ? baseChain
        : discretePitheadChain(baseChain, discreteTick);
    const flow = flowWhole(chain, seconds);
    const [face = 0, shaft = 0] = flow.piles;
    const hoisted = movedAt(flow, LIFT);
    const dug = movedAt(flow, 0);
    if (
      dug === 0 &&
      hoisted === 0 &&
      face === mountain.piles.face &&
      shaft === mountain.piles.shaft
    ) {
      return { mountain, hoisted: { topsoil: 0, granite: 0 } };
    }
    return {
      mountain: {
        ...mountain,
        piles: { ...mountain.piles, face, shaft },
        pithead: {
          ...mountain.pithead,
          topsoil: mountain.pithead.topsoil + hoisted,
        },
        rockDug: mountain.rockDug + dug,
      },
      hoisted: { topsoil: hoisted, granite: 0 },
    };
  }
  const set = undergroundPitheadSet(mountain, { pay, drilling }, pitheadDrain);
  // Resolve continuous shared cage turns first so `inTurn` never flickers and
  // shared hoist loads also get discrete Bresenham stepping on 1 s ticks.
  const [topsoil, deep] =
    discreteTick === undefined
      ? levelPair(flowBranchesWhole(set, seconds))
      : levelPair(
          branchChains(set).map((chain) =>
            flowWhole(discretePitheadChain(chain, discreteTick), 1),
          ),
        );
  const [tFace = 0, tShaft = 0] = topsoil.piles;
  const [gFace = 0, gShaft = 0] = deep.piles;
  const tHoist = movedAt(topsoil, LIFT);
  const gHoist = movedAt(deep, LIFT);
  const tDug = movedAt(topsoil, 0);
  const gDug = movedAt(deep, 0);
  if (
    tDug === 0 &&
    gDug === 0 &&
    tHoist === 0 &&
    gHoist === 0 &&
    tFace === mountain.piles.face &&
    tShaft === mountain.piles.shaft &&
    gFace === granite.piles.face &&
    gShaft === granite.piles.shaft
  ) {
    return { mountain, hoisted: { topsoil: 0, granite: 0 } };
  }
  return {
    mountain: {
      ...mountain,
      piles: { ...mountain.piles, face: tFace, shaft: tShaft },
      mineLevels: {
        ...mountain.mineLevels,
        granite: {
          ...granite,
          piles: { ...granite.piles, face: gFace, shaft: gShaft },
        },
      },
      pithead: {
        topsoil: mountain.pithead.topsoil + tHoist,
        granite: mountain.pithead.granite + gHoist,
      },
      rockDug: mountain.rockDug + tDug + gDug,
    },
    hoisted: { topsoil: tHoist, granite: gHoist },
  };
}

import {
  cageInstant,
  cagesAfter,
  landCages,
  nextLegEnd,
  topWaits,
  waitingCage,
  withCarried,
  type Instant,
  type LevelScene,
  type ShaftScene,
} from "./cage-trips";
import {
  carriedBy,
  type CageKey,
  type CageTrips,
  type ShaftCage,
} from "./cages";
import { makerOutput, makerRate, makerTakes, type MakerId } from "./makers";
import {
  MINE_LEVEL_IDS,
  openGranite,
  openLevels,
  type MineLevelId,
} from "./mine-levels";
import {
  faceHolds,
  flowMine,
  makerHolds,
  mineDraw,
  mineWork,
  mineWritten,
  shaftHolds,
  type MineFlow,
} from "./mine-piles";
import type { Mountain } from "./mountain";
import { partThreeOn } from "./part-switch";
import {
  chainChange,
  flowWhole,
  wholeSeconds,
  type Chain,
  type Pile,
} from "./piles";
import type { Stock } from "./stock";
import { stockpileRoom } from "./stockyard";

/**
 * The mine played live with the shaft's cages (slice 1, part 3, rules 5.5 to
 * 5.11, #724, ruling 11): trip by trip, as the session's tick plays it.
 * Between cage instants (`cage-trips`) the rock moves only through `piles`'
 * chains: each open level's drilling, haulage and the loading of the cage
 * waiting there, and each maker from its pile into its stockpile. Rock is in
 * stock only once a cage unloads at the top. Unattended time counts the
 * cages as rates (`mine-piles`). With part 3 off, live play is `flowMine`.
 * Imported only by `mountain`.
 */

/** Each level's maker: the kilns on the Topsoil, the saws on the Granite. */
const MAKER_OF: Readonly<Record<MineLevelId, MakerId>> = {
  topsoil: "kiln",
  granite: "saw",
};

/** What one open level works at and holds in this call, worked out once. */
type LevelPlan = {
  readonly drill: number;
  readonly haul: number;
  readonly make: number;
  readonly takes: number;
  readonly makerHolds: number;
  readonly stockHolds: number;
  readonly draw: number;
};

/**
 * What a call works out once (pre-flight C3): the cages, each open level's
 * rates and rooms, and transport's take on stone. No mountain is built per
 * step: every new mountain is a full `readRates`.
 */
type Plan = {
  readonly cages: readonly ShaftCage[];
  readonly levels: Readonly<Partial<Record<MineLevelId, LevelPlan>>>;
  readonly shaftHolds: number;
  readonly stoneHolds: number;
  readonly stoneDraw: number;
};

/** One open level's piles as live play changes them; `stock` is its maker's stockpile, drained at transport's take. */
type LevelPiles = {
  face: number;
  shaft: number;
  maker: number;
  stock: number;
};

/** The mine as live play changes it within a call, and what it did. */
type Live = {
  trips: CageTrips;
  readonly levels: Partial<Record<MineLevelId, LevelPiles>>;
  /** The scene's stone stockpile: filled by the cages, drained at transport's take. */
  stone: number;
  readonly dug: Record<MineLevelId, number>;
  /** What the cages unloaded at the top. */
  mined: number;
  /** What of it went to stone. */
  stones: number;
  readonly made: Record<MineLevelId, number>;
};

/**
 * The cages of a trip entry whose key is not among the shaft's cages: none
 * goes away while he plays, but such rock is never stranded. Each is a cage
 * that does not run, carrying its rock: it finishes its trip, unloads, and
 * stands (rule 5.11).
 */
function strayCages(
  cages: readonly ShaftCage[],
  trips: CageTrips,
): readonly ShaftCage[] {
  const known = new Set<CageKey>(cages.map((cage) => cage.key));
  const strays: ShaftCage[] = [];
  for (const [key, trip] of Object.entries(trips) as [
    CageKey,
    NonNullable<CageTrips[CageKey]>,
  ][]) {
    if (!known.has(key)) {
      strays.push({ key, load: trip.carried, runs: false, serves: trip.level });
    }
  }
  return strays;
}

/** Everything a call works out once: the cages (each load × pay, ruling 18), the rates and rooms, and transport's take. */
function planOf(mountain: Mountain, pay: number, drilling: boolean): Plan {
  const work = mineWork(mountain);
  const draw: Partial<Stock> = mineDraw(mountain, pay, drilling);
  const cages = work.cages.map((cage) => ({ ...cage, load: cage.load * pay }));
  const levels: Partial<Record<MineLevelId, LevelPlan>> = {};
  for (const level of openLevels(mountain)) {
    const maker = MAKER_OF[level];
    const good = makerOutput(maker);
    levels[level] = {
      drill: drilling ? work.levels[level].face * pay : 0,
      haul: work.levels[level].haul * pay,
      make: makerRate(mountain, maker) * pay,
      takes: makerTakes(maker),
      makerHolds: makerHolds(mountain, maker),
      stockHolds: stockpileRoom(mountain, good),
      draw: draw[good] ?? 0,
    };
  }
  return {
    cages: [...cages, ...strayCages(cages, mountain.cages.trips)],
    levels,
    shaftHolds: shaftHolds(mountain),
    stoneHolds: stockpileRoom(mountain, "stones"),
    stoneDraw: draw.stones ?? 0,
  };
}

/** The mountain's piles as live play starts them. */
function startLive(mountain: Mountain, plan: Plan): Live {
  const granite = openGranite(mountain);
  const levels: Partial<Record<MineLevelId, LevelPiles>> = {
    topsoil: {
      face: mountain.piles.face,
      shaft: mountain.piles.shaft,
      maker: mountain.piles.kiln,
      stock: mountain.stock.brick,
    },
  };
  if (granite !== undefined && plan.levels.granite !== undefined) {
    levels.granite = {
      face: granite.piles.face,
      shaft: granite.piles.shaft,
      maker: granite.piles.saw,
      stock: mountain.stock.cutStone,
    };
  }
  return {
    trips: mountain.cages.trips,
    levels,
    stone: mountain.stock.stones,
    dug: { topsoil: 0, granite: 0 },
    mined: 0,
    stones: 0,
    made: { topsoil: 0, granite: 0 },
  };
}

/** Each open level's piles and plan, the Topsoil first. */
function liveLevels(
  live: Live,
  plan: Plan,
): readonly (readonly [MineLevelId, LevelPiles, LevelPlan])[] {
  const pairs: (readonly [MineLevelId, LevelPiles, LevelPlan])[] = [];
  for (const level of MINE_LEVEL_IDS) {
    const piles = live.levels[level];
    const rates = plan.levels[level];
    if (piles !== undefined && rates !== undefined) {
      pairs.push([level, piles, rates]);
    }
  }
  return pairs;
}

/**
 * The scene the cages find now (ruling 10): each open level's rock at the
 * shaft and maker pile, whether rock is coming (haulage works and there is
 * drilled rock, or drilling works), and whether the level is in the turn
 * (haulage works, or rock waits at the shaft).
 */
function sceneOf(live: Live, plan: Plan): ShaftScene {
  const levels: Partial<Record<MineLevelId, LevelScene>> = {};
  for (const [level, piles, rates] of liveLevels(live, plan)) {
    levels[level] = {
      shaft: { held: piles.shaft, holds: plan.shaftHolds },
      maker: { held: piles.maker, holds: rates.makerHolds },
      coming: rates.haul > 0 && (piles.face > 0 || rates.drill > 0),
      inTurn: rates.haul > 0 || piles.shaft > 0,
    };
  }
  return { levels, stone: { held: live.stone, holds: plan.stoneHolds } };
}

/** An instant's outcome taken into the live state: the cages, the piles, and what was unloaded at the top. */
function afterInstant(live: Live, instant: Instant): void {
  if (!instant.changed) {
    return;
  }
  live.trips = instant.trips;
  for (const [level, scene] of Object.entries(instant.scene.levels) as [
    MineLevelId,
    LevelScene,
  ][]) {
    const piles = live.levels[level];
    if (piles !== undefined) {
      piles.shaft = scene.shaft.held;
      piles.maker = scene.maker.held;
    }
  }
  live.stone = instant.scene.stone.held;
  const toMaker = Object.values(instant.toMaker).reduce(
    (sum: number, amount) => sum + amount,
    0,
  );
  live.mined += instant.toStone + toMaker;
  live.stones += instant.toStone;
}

/**
 * A level's chain below the shaft (ruling 11): drilling, haulage, and the
 * loading of the first cage waiting there at haulage's rate, with that cage
 * as the last pile (its carried rock, and its load as the room).
 */
function levelChain(
  level: MineLevelId,
  piles: LevelPiles,
  rates: LevelPlan,
  plan: Plan,
  waiting: Pile | undefined,
): Chain {
  return {
    source: Infinity,
    rates: [rates.drill, rates.haul, waiting === undefined ? 0 : rates.haul, 0],
    piles: [
      { held: piles.face, holds: faceHolds(level) },
      { held: piles.shaft, holds: plan.shaftHolds },
      waiting ?? { held: 0, holds: 0 },
    ],
  };
}

/** A maker's chain: from its pile into its stockpile, drained at transport's take. */
function makerChain(piles: LevelPiles, rates: LevelPlan): Chain {
  return {
    source: 0,
    rates: [0, rates.make, rates.draw],
    piles: [
      { held: piles.maker, holds: rates.makerHolds },
      { held: piles.stock, holds: rates.stockHolds },
    ],
    takes: [1, rates.takes, 1],
  };
}

/** One open level's chains for a step, and the cage loading there. */
type LevelStep = {
  readonly level: MineLevelId;
  readonly piles: LevelPiles;
  readonly below: Chain;
  readonly maker: Chain;
  readonly waiting: CageKey | undefined;
};

/** Every open level's chains for the step that starts now. */
function stepChains(live: Live, plan: Plan): readonly LevelStep[] {
  return liveLevels(live, plan).map(([level, piles, rates]) => {
    const waiting = waitingCage(plan.cages, live.trips, level);
    return {
      level,
      piles,
      below: levelChain(level, piles, rates, plan, waiting?.pile),
      maker: makerChain(piles, rates),
      waiting: waiting?.key,
    };
  });
}

/**
 * The step's length (ruling 11): to the next leg's end, the next change in a
 * chain below the shaft, and one second while a cage waits at the top with
 * a load, so it tries again as transport makes room.
 */
function stepLength(
  live: Live,
  steps: readonly LevelStep[],
  left: number,
): number {
  let next = Math.min(left, wholeSeconds(nextLegEnd(live.trips)));
  for (const step of steps) {
    next = Math.min(next, wholeSeconds(chainChange(step.below)));
  }
  return topWaits(live.trips) ? Math.min(next, 1) : next;
}

/** The chains of a step run for `seconds` in whole goods, into the live state. */
function runChains(
  live: Live,
  steps: readonly LevelStep[],
  seconds: number,
): void {
  for (const { level, piles, below, maker, waiting } of steps) {
    const rock = flowWhole(below, seconds);
    const [face = 0, shaft = 0, carried = 0] = rock.piles;
    piles.face = face;
    piles.shaft = shaft;
    if (waiting !== undefined) {
      live.trips = withCarried(live.trips, waiting, carried);
    }
    live.dug[level] += rock.moved[0] ?? 0;
    const made = flowWhole(maker, seconds);
    const [makerPile = 0, stock = 0] = made.piles;
    piles.maker = makerPile;
    piles.stock = stock;
    live.made[level] += made.moved[1] ?? 0;
  }
}

/** One step: the chains, the stone stockpile drained at transport's take, and the legs counted down. */
function runStep(live: Live, plan: Plan, left: number): number {
  const steps = stepChains(live, plan);
  const seconds = stepLength(live, steps, left);
  runChains(live, steps, seconds);
  live.stone = Math.max(0, live.stone - plan.stoneDraw * seconds);
  live.trips = cagesAfter(live.trips, seconds);
  return seconds;
}

/**
 * The live state back onto the mountain, through the write-back `flowMine`
 * uses (`mineWritten`), plus the cages' trips. The stock gains the gross
 * amount unloaded and made; transport takes it afterwards (`deliver`).
 */
function writtenLive(mountain: Mountain, live: Live): MineFlow {
  const { topsoil, granite } = live.levels;
  const gained: Partial<Stock> = {
    stones: live.stones,
    brick: live.made.topsoil,
    ...(granite === undefined ? {} : { cutStone: live.made.granite }),
  };
  const flow = mineWritten(mountain, {
    dug: live.dug,
    mined: live.mined,
    gained,
    piles: {
      face: topsoil?.face ?? mountain.piles.face,
      shaft: topsoil?.shaft ?? mountain.piles.shaft,
      kiln: topsoil?.maker ?? mountain.piles.kiln,
    },
    granitePiles:
      granite === undefined
        ? undefined
        : { face: granite.face, shaft: granite.shaft, saw: granite.maker },
  });
  if (live.trips === mountain.cages.trips) {
    return flow;
  }
  const after = flow.mountain;
  return {
    ...flow,
    mountain: { ...after, cages: { ...after.cages, trips: live.trips } },
  };
}

/**
 * The mine over `seconds` of live play (ruling 11): `flowMine` exactly while
 * part 3 is off. Otherwise the cages trip by trip, each step beginning with
 * an instant, and one instant at the end. `mined` is what the cages unloaded
 * at the top, `gained` the stone unloaded and what the makers made. A mine
 * where no rock moves and no cage changes comes back as the same object.
 */
export function flowMineLive(
  mountain: Mountain,
  seconds: number,
  pay: number,
  drilling: boolean,
): MineFlow {
  if (!partThreeOn()) {
    return flowMine(mountain, seconds, pay, drilling);
  }
  const plan = planOf(mountain, pay, drilling);
  const live = startLive(mountain, plan);
  let left = Math.max(0, Math.floor(seconds));
  for (let step = 0; left > 0 && step < seconds; step += 1) {
    afterInstant(
      live,
      cageInstant(plan.cages, live.trips, sceneOf(live, plan)),
    );
    left -= runStep(live, plan, left);
  }
  afterInstant(live, cageInstant(plan.cages, live.trips, sceneOf(live, plan)));
  return writtenLive(mountain, live);
}

/**
 * Every cage brought to the top and unloaded, into its level's maker pile
 * and then the stone stockpile, before a night (ruling 13). What finds no
 * room waits in its cage at the top. The same object while part 3 is off or
 * no cage carries rock.
 */
export function landedMine(mountain: Mountain): MineFlow {
  if (!partThreeOn()) {
    return { mountain, mined: 0, gained: {} };
  }
  const carried = carriedBy(mountain.cages.trips);
  if (carried.topsoil + carried.granite <= 0) {
    return { mountain, mined: 0, gained: {} };
  }
  const plan = planOf(mountain, 1, false);
  const live = startLive(mountain, plan);
  afterInstant(live, landCages(plan.cages, live.trips, sceneOf(live, plan)));
  return writtenLive(mountain, live);
}

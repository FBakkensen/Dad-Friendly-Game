import type { StageSpeeds } from "./line";
import type { Mountain } from "./mountain";
import { kilnRate } from "./makers";
import {
  chainChange,
  chainFlows,
  chainSpill,
  flowWhole,
  type Chain,
} from "./piles";
import { effectiveRates, type Rates } from "./rates";
import { addedStock, type Stock } from "./stock";
import { stockpileRoom, stockyardOpen } from "./stockyard";
import { fleetRate, stockDraw } from "./transport";
import { lineWork } from "./workforce";

/**
 * The mine's piles (slice 1, rule 2, #703): drilled rock, between drilling
 * and haulage, and rock at the shaft, between haulage and hoisting. Each
 * stage works while it has rock in front of it and room after it, at its own
 * rate, and the chain in src/piles.ts moves the rock. A fresh mine only.
 *
 * Part 2 (#666) carries the chain on: what hoisting lifts goes to the rock at
 * the kilns while that pile has room, and bypasses to the stone stockpile when
 * it is full; the kilns make brick of it into the brick stockpile. Each
 * stockpile holds the stockyard's room and is drained by what transport takes
 * from it, so a full stockyard stops the line. Before part 2 the kilns' pile
 * has no room and the stockpiles no limit: all that is lifted is stone.
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
 * Each stage's own speed, kept per answer of `effectiveRates`: a night
 * builds the same mine's chain more than once a stretch, and that answer is
 * kept per mountain already (#314).
 */
const stageSpeeds = new WeakMap<Rates, StageSpeeds>();

function stagesOf(mountain: Mountain): StageSpeeds {
  const rates = effectiveRates(mountain);
  const kept = stageSpeeds.get(rates);
  if (kept !== undefined) {
    return kept;
  }
  const stages = lineWork(mountain, rates.tierSpeed).stages;
  stageSpeeds.set(rates, stages);
  return stages;
}

/** The chain's stages, in order: the line's three, the kilns, and transport's take on brick. */
const LIFT = 2;
const KILNS = 3;
/** The stages that make something: the line and the kilns. */
const MAKING = KILNS + 1;

/** The kilns' pile's room: none until he owns a kiln. */
function kilnHolds(mountain: Pick<Mountain, "makers">): number {
  return mountain.makers.kiln > 0 ? PILE_HOLDS.kiln : 0;
}

/**
 * The mine as a chain: drilling, haulage and hoisting at their own speeds
 * times `pay`, with the face and shaft piles between them, then the kilns'
 * pile, the kilns and the brick stockpile, with the stone stockpile taking
 * what the kilns' pile cannot (#666). Drilling is 0 when `drilling` is false
 * (the night's clock has stopped it, rule 4). Transport's take is worked out
 * only once the stockyard is open: before it, nothing is full. A dry
 * stockpile gives transport what comes in (`takeIncome`).
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
        stockDraw(mountain, pay, takeIncome(mountain, pay, drilling)),
      )
    : chainWith(mountain, pay, drilling, {});
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
  const carry = fleetRate(mountain) * pay;
  return chainIncome(
    chainWith(mountain, pay, drilling, { stones: carry, brick: carry }),
  );
}

/** The mine's chain with transport taking `draw` a second from the stockpiles. */
function chainWith(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
  draw: Partial<Stock>,
): Chain {
  const stages = stagesOf(mountain);
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
    spill: {
      from: LIFT,
      held: mountain.stock.stones,
      holds: stockpileRoom(mountain, "stones"),
      drain: draw.stones ?? 0,
    },
  };
}

/** What a mine's chain brings to the stockpiles a second now: stone and brick. */
export function chainIncome(chain: Chain): Partial<Stock> {
  return {
    stones: chainSpill(chain),
    brick: chainFlows(chain)[KILNS] ?? 0,
  };
}

/** Whether any stage of a mine's chain moves rock or makes brick now (transport's take aside). */
export function chainMakes(chain: Chain): boolean {
  return chainFlows(chain)
    .slice(0, MAKING)
    .some((flow) => flow > 0);
}

/** Whether any stage moves rock or makes brick now: it has something in front of it and room after it. */
export function mineMoves(mountain: Mountain): boolean {
  return chainMakes(mineChain(mountain, 1, true));
}

/** Seconds until a stage's flow changes (a pile fills or empties), or Infinity. */
export function mineChange(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): number {
  return chainChange(mineChain(mountain, pay, drilling));
}

/**
 * The mine over `seconds`, in whole stones: rock moves through the piles,
 * what hoisting lifts goes to the kilns' pile or bypasses to stone, and the
 * kilns make brick (#666), all into the stock (the mountain stays full).
 * `mined` is the rock hoisting lifted, `gained` what reached the stockpiles.
 * A mine where nothing moves comes back as the same object.
 */
export function flowMine(
  mountain: Mountain,
  seconds: number,
  pay: number,
  drilling: boolean,
): {
  readonly mountain: Mountain;
  readonly mined: number;
  readonly gained: Partial<Stock>;
} {
  const flow = flowWhole(mineChain(mountain, pay, drilling), seconds);
  const dug = flow.moved[0] ?? 0;
  const mined = flow.moved[LIFT] ?? 0;
  const brick = flow.moved[KILNS] ?? 0;
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

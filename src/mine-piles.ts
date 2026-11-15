import type { StageSpeeds } from "./line";
import type { Mountain } from "./mountain";
import { chainChange, chainFlows, flowWhole, type Chain } from "./piles";
import { effectiveRates, type Rates } from "./rates";
import { addedStock } from "./stock";
import { lineWork } from "./workforce";

/**
 * The mine's two piles (slice 1, rule 2, #703): drilled rock, between
 * drilling and haulage, and rock at the shaft, between haulage and hoisting.
 * Each stage works while it has rock in front of it and room after it, at
 * its own rate, and the chain in src/piles.ts moves the rock. What hoisting
 * lifts is stone in the stock. A fresh mine only.
 */

/** The two piles, by where the rock waits. */
export const PILE_IDS = ["face", "shaft"] as const;

export type PileId = (typeof PILE_IDS)[number];

/** Rock in each pile, in whole stones. */
export type MinePiles = Readonly<Record<PileId, number>>;

/**
 * Each pile's room, as the lab set it (#703): a hundred seconds of the
 * lone worker's drilling, so his first stone comes up in under four
 * minutes and the casual dad raises the Light Tower's roof on day 2. A
 * larger room (500 and up) slows every player type's start. A pile over
 * its room is full and never emptied by a lower one (ruling 2), so this may
 * change with no version bump.
 */
export const PILE_HOLDS: MinePiles = { face: 300, shaft: 300 };

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

/**
 * The mine as a chain: drilling, haulage and hoisting at their own speeds
 * times `pay`, with the face and shaft piles between them. Drilling is 0
 * when `drilling` is false (the night's clock has stopped it, rule 4).
 */
export function mineChain(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): Chain {
  const stages = stagesOf(mountain);
  return {
    source: Infinity,
    rates: [
      drilling ? stages.face * pay : 0,
      stages.haul * pay,
      stages.lift * pay,
    ],
    piles: [
      { held: mountain.piles.face, holds: PILE_HOLDS.face },
      { held: mountain.piles.shaft, holds: PILE_HOLDS.shaft },
    ],
  };
}

/** Whether any stage moves rock now: it has rock in front of it and room after it. */
export function mineMoves(mountain: Mountain): boolean {
  return chainFlows(mineChain(mountain, 1, true)).some((flow) => flow > 0);
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
 * and what hoisting lifts goes to the stock, as `digStones` puts it in a
 * fresh mine (the mountain stays full). A mine where nothing moves comes back
 * as the same object.
 */
export function flowMine(
  mountain: Mountain,
  seconds: number,
  pay: number,
  drilling: boolean,
): { readonly mountain: Mountain; readonly mined: number } {
  const flow = flowWhole(mineChain(mountain, pay, drilling), seconds);
  const mined = flow.moved[2] ?? 0;
  const face = flow.piles[0] ?? 0;
  const shaft = flow.piles[1] ?? 0;
  if (
    mined === 0 &&
    face === mountain.piles.face &&
    shaft === mountain.piles.shaft
  ) {
    return { mountain, mined: 0 };
  }
  return {
    mountain: {
      ...mountain,
      stock:
        mined === 0
          ? mountain.stock
          : addedStock(mountain.stock, { stones: mined }),
      piles: { face, shaft },
    },
    mined,
  };
}

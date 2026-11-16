import { describe, expect, it } from "vitest";
import { listActions, type Action } from "./economy/actions";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";

const partThree = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

const KILN: Action = { kind: "buyMaker", id: "kiln" };
const SAW: Action = { kind: "buyMaker", id: "saw" };
const EXPAND: Action = { kind: "expandStockyard" };

function mine(sunk: boolean): Mountain {
  return {
    ...createMountain(),
    operational: ["lightTower"],
    granite: sunk
      ? {
          kind: "sunk",
          machines: NO_LEVEL_MACHINES,
          piles: NO_GRANITE_PILES,
        }
      : { kind: "unsunk" },
  };
}

function yardMoves(mountain: Mountain): readonly Action[] {
  return listActions(mountain, 0).filter(
    (action) => action.kind === "buyMaker" || action.kind === "expandStockyard",
  );
}

describe("part 3's buys as moves (#673)", () => {
  it("lists a saw beside the kiln once the shaft is sunk, and only the kiln before", () => {
    partThree(() => {
      expect(yardMoves(mine(true))).toEqual([KILN, SAW, EXPAND]);
      expect(yardMoves(mine(false))).toEqual([KILN, EXPAND]);
    });
    partTwo(() => {
      expect(yardMoves(mine(true))).toEqual([KILN, EXPAND]);
    });
  });
});

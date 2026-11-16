import { describe, expect, it } from "vitest";
import { NO_HOISTS_ASSIGNED } from "./cages";
import {
  applyMove,
  listActions,
  valueOf,
  type Action,
} from "./economy/actions";
import { withFactors } from "./economy/factors";
import { fieldEntry } from "./field-log";
import { sticker } from "./lab/decide";
import { FRESH_OFF } from "./line-switch";
import {
  MINE_LEVEL_IDS,
  NO_GRANITE_PILES,
  NO_LEVEL_MACHINES,
  levelMachines,
  type MineLevelId,
} from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { EMPTY_STOCK, type Stock } from "./stock";
import { tierById, tierGood, tierQuote } from "./tiers";

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

describe("the truck as a move (#673)", () => {
  const TRUCK: Action = { kind: "buyVehicle", id: "truck" };
  const warehoused = (operational: Mountain["operational"]): Mountain => ({
    ...createMountain(),
    operational,
  });
  const truckMoves = (mountain: Mountain): readonly Action[] =>
    listActions(mountain, 0).filter(
      (action) => action.kind === "buyVehicle" && action.id === "truck",
    );

  it("lists a truck once the Warehouse is operational in part 3, and never in part 2", () => {
    partThree(() => {
      expect(truckMoves(warehoused(["lightTower"]))).toEqual([]);
      expect(truckMoves(warehoused(["lightTower", "warehouse"]))).toEqual([
        TRUCK,
      ]);
    });
    partTwo(() => {
      expect(truckMoves(warehoused(["lightTower", "warehouse"]))).toEqual([]);
    });
  });
});

describe("the shaft and the Granite's machines as moves (#673)", () => {
  const SINK: Action = { kind: "sinkShaft" };
  const GRANITE_BORER: Action = {
    kind: "buyGraniteMachine",
    id: "borer",
    count: 1,
  };

  const stocked = (mountain: Mountain, stock: Partial<Stock>): Mountain => ({
    ...mountain,
    stock: { ...EMPTY_STOCK, ...stock },
  });
  const levelMoves = (mountain: Mountain): readonly Action[] =>
    listActions(mountain, 0).filter(
      (action) =>
        action.kind === "sinkShaft" || action.kind === "buyGraniteMachine",
    );

  it("lists Sink the shaft once the Light Tower is up in part 3, never in part 2, and not once sunk", () => {
    partThree(() => {
      expect(levelMoves(mine(false))).toEqual([SINK]);
      expect(levelMoves(createMountain())).toEqual([]);
      expect(levelMoves(mine(true))).not.toContainEqual(SINK);
    });
    partTwo(() => {
      expect(levelMoves(mine(false))).toEqual([]);
    });
    expect(levelMoves(mine(false))).toEqual([]);
  });

  it("sinks it at once and logs it", () => {
    partThree(() => {
      const start = stocked(mine(false), {
        stones: 10_000_000,
        brick: 1_500_000,
      });
      const result = applyMove(start, SINK, 0);
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      expect(result.mountain.granite.kind).toBe("sunk");
      expect(result.spent).toEqual({
        ...EMPTY_STOCK,
        stones: 10_000_000,
        brick: 1_500_000,
      });
      expect(result.events).toEqual([{ kind: "shaftSunk" }]);
      expect(fieldEntry({ kind: "shaftSunk" })).toEqual({
        code: "shaft.sink",
        data: { id: "granite" },
      });
      // Short of the price, it is refused.
      expect(applyMove(mine(false), SINK, 0).kind).toBe("refused");
    });
  });

  it("lists a Granite machine for each level machine on sale once the shaft is sunk", () => {
    partThree(() => {
      expect(levelMoves(mine(true))).toEqual([
        { kind: "buyGraniteMachine", id: "cart", count: 1 },
        { kind: "buyGraniteMachine", id: "drill", count: 1 },
        { kind: "buyGraniteMachine", id: "borer", count: 1 },
        { kind: "buyGraniteMachine", id: "train", count: 1 },
      ]);
      expect(
        levelMoves(mine(false)).filter(
          (action) => action.kind === "buyGraniteMachine",
        ),
      ).toEqual([]);
    });
    partTwo(() => {
      expect(levelMoves(mine(true))).toEqual([]);
    });
  });

  it("buys it for the Granite: what he owns and the Granite's count rise together, and it is logged", () => {
    partThree(() => {
      const start = stocked(mine(true), { cutStone: 40_000 });
      const result = applyMove(start, GRANITE_BORER, 0);
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      const after = result.mountain;
      expect(after.owned.borer).toBe(1);
      expect(levelMachines(after, "granite").borer).toBe(1);
      expect(levelMachines(after, "topsoil").borer).toBe(0);
      expect(result.spent.cutStone).toBe(40_000);
      expect(result.events).toEqual([
        { kind: "graniteMachineBought", id: "borer", count: 1 },
      ]);
      expect(
        fieldEntry({ kind: "graniteMachineBought", id: "borer", count: 1 }),
      ).toEqual({ code: "granite.buy", data: { id: "borer", count: 1 } });
    });
  });

  it("buys ten drills for the Granite at the ten-drill price", () => {
    partThree(() => {
      const drill = tierById("drill");
      const good = tierGood("drill");
      const price = tierQuote(mine(true), drill, "ten").cost;
      const start = stocked(mine(true), { [good]: price });
      const result = applyMove(
        start,
        { kind: "buyGraniteMachine", id: "drill", count: 10 },
        0,
      );
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      const after = result.mountain;
      expect(after.owned.drill).toBe(start.owned.drill + 10);
      expect(levelMachines(after, "granite").drill).toBe(
        levelMachines(start, "granite").drill + 10,
      );
      expect(result.spent[good]).toBe(price);
      expect(result.events).toEqual([
        {
          kind: "graniteMachineBought",
          id: "drill",
          count: levelMachines(after, "granite").drill,
        },
      ]);
      const short = stocked(mine(true), { [good]: price - 1 });
      const before = structuredClone(short);
      expect(
        applyMove(
          short,
          { kind: "buyGraniteMachine", id: "drill", count: 10 },
          0,
        ),
      ).toEqual({ kind: "refused" });
      // Short of ten, he buys none: the mine is as it was.
      expect(short).toEqual(before);
      expect(levelMachines(short, "granite").drill).toBe(
        levelMachines(start, "granite").drill,
      );
    });
  });

  it("refuses a Granite machine he cannot pay for: nothing changes", () => {
    partThree(() => {
      const broke = stocked(mine(true), { cutStone: 39_999 });
      expect(applyMove(broke, GRANITE_BORER, 0)).toEqual({
        kind: "refused",
      });
    });
    // With part 3 off, a sunk save buys nothing for the Granite, not even on the Topsoil.
    partTwo(() => {
      const rich = stocked(mine(true), { stones: 1e9, cutStone: 1e9 });
      expect(
        applyMove(rich, { kind: "buyGraniteMachine", id: "cart", count: 1 }, 0),
      ).toEqual({ kind: "refused" });
    });
  });

  it("brings the first engineer with the first borer on the Granite, as on the Topsoil", () => {
    partThree(() => {
      const start = stocked(mine(true), { cutStone: 40_000 });
      expect(start.engineers).toEqual([]);
      const result = applyMove(start, GRANITE_BORER, 0);
      expect(
        result.kind === "applied" && result.mountain.engineers.length,
      ).toBe(1);
    });
  });

  it("values neither as income (the lab's, #675)", () => {
    partThree(() => {
      const context = { tapsPerSecond: 0, liveSeconds: 600, awaySeconds: 0 };
      expect(valueOf(mine(false), SINK, 3600, context)).toEqual({
        gainPerSec: 0,
        cost: 10_000_000,
        paybackSec: Infinity,
      });
      expect(valueOf(mine(true), GRANITE_BORER, 3600, context)).toEqual({
        gainPerSec: 0,
        cost: 0,
        paybackSec: Infinity,
      });
      // The stone price the lab records: the shaft's, and none for a Granite machine.
      expect(sticker(mine(false), SINK)).toBe(10_000_000);
      expect(sticker(mine(true), GRANITE_BORER)).toBe(0);
    });
  });
});

describe("assigning hoists as moves (#724)", () => {
  const ASSIGN_GRANITE: Action = {
    kind: "assignHoist",
    level: "granite",
    count: 1,
  };
  const UNASSIGN_TOPSOIL: Action = {
    kind: "unassignHoist",
    level: "topsoil",
    count: 1,
  };

  /** A mine owning `hoists` hoists, `assigned` of them on each level. */
  const hoisted = (
    sunk: boolean,
    hoists: number,
    assigned: Partial<Record<MineLevelId, number>> = {},
  ): Mountain => {
    const start = mine(sunk);
    const counts: Record<MineLevelId, number> = { ...NO_HOISTS_ASSIGNED };
    for (const level of MINE_LEVEL_IDS) {
      counts[level] = assigned[level] ?? 0;
    }
    return {
      ...start,
      owned: { ...start.owned, hoist: hoists },
      cages: { ...start.cages, assigned: counts },
    };
  };
  const hoistMoves = (mountain: Mountain): readonly Action[] =>
    listActions(mountain, 0).filter(
      (action) =>
        action.kind === "assignHoist" || action.kind === "unassignHoist",
    );

  it("lists assigning a hoist to each level once the Granite is open and a hoist is unassigned, and none before (#724)", () => {
    partThree(() => {
      expect(hoistMoves(hoisted(true, 2))).toEqual([
        { kind: "assignHoist", level: "topsoil", count: 1 },
        ASSIGN_GRANITE,
      ]);
      // The shaft unsunk, or no hoist owned: nothing to assign.
      expect(hoistMoves(hoisted(false, 2))).toEqual([]);
      expect(hoistMoves(hoisted(true, 0))).toEqual([]);
      // They come after the Granite's machines.
      const kinds = listActions(hoisted(true, 2), 0).map(
        (action) => action.kind,
      );
      expect(kinds.indexOf("assignHoist")).toBeGreaterThan(
        kinds.lastIndexOf("buyGraniteMachine"),
      );
    });
    // Part 3 off lists none, even on a sunk save.
    partTwo(() => {
      expect(hoistMoves(hoisted(true, 2))).toEqual([]);
    });
    expect(hoistMoves(hoisted(true, 2))).toEqual([]);
  });

  it("assigns at once, free, and logs it", () => {
    partThree(() => {
      const result = applyMove(hoisted(true, 2), ASSIGN_GRANITE, 0);
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      expect(result.mountain.cages.assigned).toEqual({
        topsoil: 0,
        granite: 1,
      });
      expect(result.spent).toEqual(EMPTY_STOCK);
      expect(result.gained).toEqual(EMPTY_STOCK);
      expect(result.events).toEqual([
        { kind: "hoistAssigned", level: "granite", count: 1 },
      ]);
      expect(
        fieldEntry({ kind: "hoistAssigned", level: "granite", count: 1 }),
      ).toEqual({ code: "hoist.assign", data: { id: "granite", count: 1 } });
    });
  });

  it("refuses an assign with every hoist assigned: nothing changes", () => {
    partThree(() => {
      const full = hoisted(true, 2, { topsoil: 1, granite: 1 });
      expect(applyMove(full, ASSIGN_GRANITE, 0)).toEqual({ kind: "refused" });
      expect(
        hoistMoves(full).filter((action) => action.kind === "assignHoist"),
      ).toEqual([]);
      // The Granite unsunk: refused too.
      expect(applyMove(hoisted(false, 2), ASSIGN_GRANITE, 0)).toEqual({
        kind: "refused",
      });
    });
    // With part 3 off, a sunk save assigns nothing.
    partTwo(() => {
      expect(applyMove(hoisted(true, 2), ASSIGN_GRANITE, 0)).toEqual({
        kind: "refused",
      });
    });
  });

  it("lists taking a hoist off a level while it has one", () => {
    partThree(() => {
      const one = hoisted(true, 2, { topsoil: 1 });
      expect(hoistMoves(one)).toEqual([
        { kind: "assignHoist", level: "topsoil", count: 1 },
        UNASSIGN_TOPSOIL,
        ASSIGN_GRANITE,
      ]);
      // Every hoist assigned: only the moves off.
      expect(hoistMoves(hoisted(true, 2, { topsoil: 1, granite: 1 }))).toEqual([
        UNASSIGN_TOPSOIL,
        { kind: "unassignHoist", level: "granite", count: 1 },
      ]);
      const result = applyMove(one, UNASSIGN_TOPSOIL, 0);
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      expect(result.mountain.cages.assigned).toEqual({
        topsoil: 0,
        granite: 0,
      });
      expect(result.spent).toEqual(EMPTY_STOCK);
      expect(result.events).toEqual([
        { kind: "hoistUnassigned", level: "topsoil", count: 0 },
      ]);
      expect(
        fieldEntry({ kind: "hoistUnassigned", level: "topsoil", count: 0 }),
      ).toEqual({ code: "hoist.unassign", data: { id: "topsoil", count: 0 } });
      // A level with none: refused.
      expect(
        applyMove(
          one,
          { kind: "unassignHoist", level: "granite", count: 1 },
          0,
        ),
      ).toEqual({ kind: "refused" });
    });
  });

  it("values neither as income (the lab's, #675)", () => {
    partThree(() => {
      const context = { liveSeconds: 600, awaySeconds: 0 };
      const one = hoisted(true, 2, { topsoil: 1 });
      for (const action of [ASSIGN_GRANITE, UNASSIGN_TOPSOIL]) {
        expect(valueOf(one, action, 3600, context)).toEqual({
          gainPerSec: 0,
          cost: 0,
          paybackSec: Infinity,
        });
        expect(sticker(one, action)).toBe(0);
      }
    });
  });
});

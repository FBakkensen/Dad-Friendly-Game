import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import {
  GRANITE_PILE_IDS,
  LEVEL_MACHINE_IDS,
  NO_GRANITE_PILES,
  NO_LEVEL_MACHINES,
  UNSUNK,
  graniteOpen,
  levelMachines,
  shaftOpen,
  shaftPrice,
  sinkShaft,
} from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF, partThreeOn } from "./part-switch";
import type { Stock } from "./stock";

const partThree = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

/** A fresh mine with the Light Tower operational and this stock. */
function lit(stock: Partial<Stock> = {}): Mountain {
  const start = createMountain();
  return {
    ...start,
    operational: ["lightTower"],
    stock: { ...start.stock, ...stock },
  };
}

const sunk = (machines: Partial<typeof NO_LEVEL_MACHINES>): Mountain => ({
  ...createMountain(),
  granite: {
    kind: "sunk",
    machines: { ...NO_LEVEL_MACHINES, ...machines },
    piles: NO_GRANITE_PILES,
  },
});

describe("part 3's switch (#673)", () => {
  it("is off outside a sweep, and on only with fresh.off, part2.off and part3.off at 0", () => {
    expect(partThreeOn()).toBe(false);
    partTwo(() => {
      expect(partThreeOn()).toBe(false);
    });
    partThree(() => {
      expect(partThreeOn()).toBe(true);
    });
    withFactors({ [FRESH_OFF]: 0, [PART_THREE_OFF]: 0 }, () => {
      expect(partThreeOn()).toBe(false);
    });
  });
});

describe("the shaft (rule 1.3, 1.4, 5.4)", () => {
  it("can be sunk once the Light Tower is operational, in part 3 only", () => {
    partThree(() => {
      expect(shaftOpen(lit())).toBe(true);
      expect(shaftOpen(createMountain())).toBe(false);
      expect(shaftOpen({ ...lit(), granite: sunk({}).granite })).toBe(false);
    });
    partTwo(() => {
      expect(shaftOpen(lit())).toBe(false);
    });
    expect(shaftOpen(lit())).toBe(false);
  });

  it("costs 10M stone and 1.5M brick, and opens the Granite with nobody and nothing on it", () => {
    partThree(() => {
      const before = lit({ stones: 10_000_005, brick: 1_500_000 });
      const after = sinkShaft(before);
      expect(after.stock.stones).toBe(5);
      expect(after.stock.brick).toBe(0);
      expect(after.granite).toEqual({
        kind: "sunk",
        machines: NO_LEVEL_MACHINES,
        piles: NO_GRANITE_PILES,
      });
      expect(after.jobs).toEqual(before.jobs);
      expect(after.owned).toEqual(before.owned);
      expect(graniteOpen(after)).toBe(true);
    });
  });

  it("scales both lines of its price by price.shaft", () => {
    partThree(() => {
      expect(shaftPrice()).toEqual([
        { good: "stones", amount: 10_000_000 },
        { good: "brick", amount: 1_500_000 },
      ]);
    });
    withFactors({ "price.shaft": 0.5 }, () => {
      expect(shaftPrice()).toEqual([
        { good: "stones", amount: 5_000_000 },
        { good: "brick", amount: 750_000 },
      ]);
    });
  });

  it("refuses with too little of either good, a second time, before the Light Tower, and with part 3 off", () => {
    partThree(() => {
      const noStone = lit({ stones: 9_999_999, brick: 1_500_000 });
      expect(sinkShaft(noStone)).toBe(noStone);
      const noBrick = lit({ stones: 10_000_000, brick: 1_499_999 });
      expect(sinkShaft(noBrick)).toBe(noBrick);
      const done = sinkShaft(lit({ stones: 30_000_000, brick: 3_000_000 }));
      expect(sinkShaft(done)).toBe(done);
      const dark = {
        ...createMountain(),
        stock: {
          ...createMountain().stock,
          stones: 10_000_000,
          brick: 1_500_000,
        },
      };
      expect(sinkShaft(dark)).toBe(dark);
    });
    partTwo(() => {
      const rich = lit({ stones: 10_000_000, brick: 1_500_000 });
      expect(sinkShaft(rich)).toBe(rich);
    });
  });

  it("starts every fresh mine unsunk", () => {
    expect(createMountain().granite).toEqual(UNSUNK);
  });
});

describe("a level's machines (rule 5.2, 5.3)", () => {
  it("names the machines and piles a level has", () => {
    expect(LEVEL_MACHINE_IDS).toEqual(["cart", "drill", "borer", "train"]);
    expect(GRANITE_PILE_IDS).toEqual(["face", "shaft", "saw"]);
  });

  it("puts every machine on the Topsoil while one level is open", () => {
    partThree(() => {
      const mine = {
        ...createMountain(),
        owned: { ...createMountain().owned, cart: 3 },
      };
      expect(levelMachines(mine, "topsoil")).toEqual({
        ...NO_LEVEL_MACHINES,
        cart: 3,
      });
      expect(levelMachines(mine, "granite")).toEqual(NO_LEVEL_MACHINES);
    });
  });

  it("gives the Topsoil what he owns less the Granite's", () => {
    partThree(() => {
      const base = sunk({ borer: 2 });
      const mine = { ...base, owned: { ...base.owned, borer: 3 } };
      expect(levelMachines(mine, "topsoil").borer).toBe(1);
      expect(levelMachines(mine, "granite").borer).toBe(2);
    });
  });

  it("reads none on the Granite with part 3 off, whatever the save holds", () => {
    partTwo(() => {
      const base = sunk({ borer: 2 });
      const mine = { ...base, owned: { ...base.owned, borer: 3 } };
      expect(levelMachines(mine, "topsoil").borer).toBe(3);
      expect(levelMachines(mine, "granite")).toEqual(NO_LEVEL_MACHINES);
    });
  });
});

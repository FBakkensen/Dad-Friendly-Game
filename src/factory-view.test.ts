import { describe, expect, it } from "vitest";
import { factoryView } from "./factory-view";
import { makerInputRoom } from "./makers";
import { NO_LEVEL_MACHINES, NO_MINE_LEVELS } from "./mine-levels";
import { type Mountain } from "./mountain";
import { levels, slice2Part1, slice2Part2 } from "./part-three.harness";
import { EMPTY_STOCK } from "./stock";

function part2FactoryBase(overrides: Partial<Mountain> = {}): Mountain {
  const base = levels({
    sunk: true,
    operational: ["lightTower", "warehouse", "foundry"],
    topsoil: 2,
    granite: 2,
    hoisting: 2,
    driving: 2,
    kilns: 1,
    saws: 1,
    stock: {
      stones: 10_000,
      brick: 100_000,
      cutStone: 100_000,
      glass: 100_000,
      parts: 0,
    },
  });
  return {
    ...base,
    fleet: { horseWagon: 1, truck: 1 },
    makers: {
      ...base.makers,
      partsPress: 1,
      precisionAssembly: 0,
    },
    jobs: {
      ...base.jobs,
      partsPress: 2,
    },
    owned: {
      ...base.owned,
      helper: base.owned.helper + 4,
    },
    ...overrides,
  };
}

describe("factory-view (#779)", () => {
  it("stays closed when Slice 2 Part 2 is off even if Foundry is operational", () => {
    slice2Part1(() => {
      const m = part2FactoryBase();
      const view = factoryView(m);
      expect(view.open).toBe(false);
      expect(view.lines).toEqual([]);
    });
  });

  it("shows Parts Press with 2 input buffers and Parts output buffer once Foundry is operational", () => {
    slice2Part2(() => {
      const m = part2FactoryBase({
        makerBuffers: {
          kiln: {},
          saw: {},
          glassworks: {},
          partsPress: { brick: 400, cutStone: 200 },
          precisionAssembly: {},
        },
        factoryOutput: { parts: 150 },
      });
      const view = factoryView(m);
      expect(view.open).toBe(true);
      expect(view.lines.map((line) => line.id)).toEqual(["partsPress"]);
      const press = view.lines[0];
      expect(press?.recipe).toBe("Recipe: 2 brick + 2 cut stone → 1 part");
      expect(press?.buffers.map((buf) => buf.id)).toEqual([
        "brick",
        "cutStone",
      ]);
      expect(press?.buffers[0]?.held).toBe(400);
      expect(press?.buffers[0]?.room).toBe(
        makerInputRoom(m, "partsPress", "brick"),
      );
      expect(press?.buffers[1]?.held).toBe(200);
      expect(press?.standing).toBe(false);
      expect(press?.key.priceParts?.map((part) => part.good)).toEqual([
        "brick",
        "cutStone",
      ]);
      expect(view.output.held).toBe(150);
      expect(view.output.full).toBe(false);
    });
  });

  it("adds Precision Assembly with 3 input buffers once Crystal Caves is sunk and marks standing lines", () => {
    slice2Part2(() => {
      const base = part2FactoryBase();
      const withCrystal: Mountain = {
        ...base,
        mineLevels: {
          ...base.mineLevels,
          crystal: {
            machines: NO_LEVEL_MACHINES,
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        makers: {
          ...base.makers,
          partsPress: 1,
          precisionAssembly: 1,
        },
        jobs: {
          ...base.jobs,
          driving: 0,
          partsPress: 2,
          precisionAssembly: 3,
        },
        makerBuffers: {
          kiln: {},
          saw: {},
          glassworks: {},
          partsPress: { brick: 0, cutStone: 200 },
          precisionAssembly: { brick: 100, cutStone: 100, glass: 100 },
        },
      };
      const view = factoryView(withCrystal);
      expect(view.lines.map((line) => line.id)).toEqual([
        "partsPress",
        "precisionAssembly",
      ]);
      expect(view.lines[0]?.recipe).toBe(
        "Recipe: 2 brick + 2 cut stone → 1 part",
      );
      expect(view.lines[1]?.recipe).toBe(
        "Recipe: 2 brick + 2 cut stone + 2 glass → 3 parts",
      );
      // Parts Press has 0 brick -> starved -> standing.
      expect(view.lines[0]?.standing).toBe(true);
      expect(view.lines[0]?.buffers[0]?.empty).toBe(true);
      // Precision Assembly has 3 buffers stocked -> running.
      expect(view.lines[1]?.buffers.map((buf) => buf.id)).toEqual([
        "brick",
        "cutStone",
        "glass",
      ]);
      expect(view.lines[1]?.standing).toBe(false);
      expect(view.lines[1]?.key.priceParts?.map((part) => part.good)).toEqual([
        "cutStone",
        "glass",
      ]);
    });
  });

  it("hides Factory when Foundry is not operational even under Part 2", () => {
    slice2Part2(() => {
      const m = part2FactoryBase({
        operational: ["lightTower", "warehouse"],
        mineLevels: NO_MINE_LEVELS,
        stock: EMPTY_STOCK,
      });
      expect(factoryView(m).open).toBe(false);
    });
  });
});

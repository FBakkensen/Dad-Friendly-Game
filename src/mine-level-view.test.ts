import { describe, expect, it } from "vitest";
import { hoistsOwned, tripSeconds } from "./cages";
import { formatCompact } from "./format";
import {
  BOTH_IN_TURN,
  GRANITE_NOT_REACHED,
  HOIST_WAITS_LINE,
  LEVEL_NAMES,
  MACHINE_CARD_STAYS,
  NOT_NOW,
  SHAFT_WAITS_LINE,
  SINK_KEY,
  SINK_LINE,
  WORKFORCE_GROUPS,
  hoistStrip,
  hoistingRow,
  levelHasLine,
  machineCardTitle,
  mineLevels,
  shaftGate,
} from "./mine-level-view";
import {
  faceHolds,
  mineChain,
  mineLevelFlows,
  mineWork,
  shaftHolds,
} from "./mine-piles";
import { printedParts } from "./mine-view";
import { levels, partThree, partTwo } from "./part-three.harness";
import { chainFlows } from "./piles";
import { crewTimer } from "./rates";
import { readGame } from "./save-format";
import { LEVEL_JOBS } from "./workforce";

/** The mine's two levels as views (#680): each level's rows and piles, Hoisting's row, the strip and the shaft's gate. */

/** A running hoist's load: what it lifts in one trip to the Topsoil and back. */
function hoistLoad(mountain: Parameters<typeof mineWork>[0]): number {
  const hoist = mineWork(mountain).cages.find((cage) => cage.key === "hoist:0");
  if (hoist === undefined) {
    throw new Error("no hoist");
  }
  return hoist.load;
}

describe("the mine's levels", () => {
  it("shows no levels while part 3 is off, or the Granite is not sunk", () => {
    const m = levels({ topsoil: 2, granite: 2 });
    expect(partTwo(() => mineLevels(m))).toEqual([]);
    expect(partThree(() => mineLevels(levels({ sunk: false })))).toEqual([]);
  });

  it("gives each level its own drilling and haulage rows, on its own workers and machines", () => {
    partThree(() => {
      const m = levels({ topsoil: 4, granite: 2, sunk: true });
      const shown = mineLevels(m);
      expect(shown.map((level) => level.level)).toEqual(["topsoil", "granite"]);
      expect(shown.map((level) => level.name)).toEqual(["Topsoil", "Granite"]);
      const [topsoil, granite] = shown;
      expect(topsoil?.rows.map((row) => row.workers)).toEqual([4, 4]);
      expect(granite?.rows.map((row) => row.workers)).toEqual([2, 2]);
      for (const level of shown) {
        expect(level.rows.map((row) => row.stage)).toEqual(["face", "haul"]);
        for (const row of level.rows) {
          expect(row.job).toBe(
            LEVEL_JOBS[level.level][row.stage as "face" | "haul"],
          );
        }
      }
    });
  });

  it("says what each level moves now through its own piles", () => {
    partThree(() => {
      const m = levels({
        topsoil: 4,
        granite: 2,
        granitePiles: { face: 100 },
      });
      const flows = mineLevelFlows(m);
      for (const level of mineLevels(m)) {
        expect(level.rows.map((row) => row.now)).toEqual([
          formatCompact(flows.levels[level.level].face),
          formatCompact(flows.levels[level.level].haul),
        ]);
      }
      expect(flows.levels.granite.face).toBeGreaterThan(0);
    });
  });

  it("gives the Topsoil's flows alone with one level", () => {
    partThree(() => {
      const m = levels({ topsoil: 3, hoisting: 2, sunk: false });
      const [face = 0, haul = 0, lift = 0] = chainFlows(mineChain(m, 1, true));
      expect(mineLevelFlows(m)).toEqual({
        levels: { topsoil: { face, haul }, granite: { face: 0, haul: 0 } },
        lift,
      });
    });
  });

  it("says each level's piles with their rooms", () => {
    partThree(() => {
      const m = levels({
        topsoil: 1,
        granite: 1,
        piles: { face: 10, shaft: 20 },
        granitePiles: { face: 50, shaft: 70 },
      });
      const [topsoil, granite] = mineLevels(m);
      expect(granite?.piles).toEqual({
        face: { label: "Drilled rock", held: 50, holds: faceHolds("granite") },
        shaft: { label: "Rock at the shaft", held: 70, holds: shaftHolds(m) },
      });
      expect(topsoil?.piles.face.held).toBe(10);
      expect(topsoil?.piles.shaft.held).toBe(20);
      expect(granite?.rows.map((row) => row.pile)).toEqual([
        granite?.piles.face,
        granite?.piles.shaft,
      ]);
    });
  });

  it("scales every band by the strongest of the mine's five stages", () => {
    partThree(() => {
      const m = levels({ topsoil: 4, granite: 2, hoisting: 3, hoists: 2 });
      const rows = [
        ...mineLevels(m).flatMap((level) => level.rows),
        hoistingRow(m),
      ];
      expect(Math.max(...rows.map((row) => row.band.can))).toBeCloseTo(1, 9);
    });
  });
});

describe("hoisting's row and the strip", () => {
  const three = () =>
    levels({
      topsoil: 2,
      granite: 2,
      hoisting: 5,
      hoists: 3,
      assigned: { topsoil: 1, granite: 1 },
    });

  it("adds the strip's counts up to the hoists he owns, and its rates up to the row's hoists", () => {
    partThree(() => {
      const m = three();
      const strip = hoistStrip(m);
      expect(strip.map((cell) => cell.place)).toEqual([
        "topsoil",
        "granite",
        "both",
      ]);
      expect(strip.map((cell) => cell.name)).toEqual([
        "Topsoil",
        "Granite",
        "Both in turn",
      ]);
      expect(strip.map((cell) => cell.count)).toEqual([1, 1, 1]);
      expect(strip.reduce((sum, cell) => sum + cell.count, 0)).toBe(
        hoistsOwned(m.owned),
      );
      expect(strip.map((cell) => cell.unit)).toEqual([
        "hoist",
        "hoist",
        "hoist",
      ]);
      const load = hoistLoad(m);
      const [topsoil, granite, both] = strip;
      expect(topsoil.rateValue).toBeCloseTo(load / tripSeconds("topsoil"), 9);
      expect(granite.rateValue).toBeCloseTo(load / tripSeconds("granite"), 9);
      expect(both.rateValue).toBeCloseTo(
        (2 * load) / (tripSeconds("topsoil") + tripSeconds("granite")),
        9,
      );
      expect(topsoil.rateValue).toBeCloseTo(load / 10, 9);
      expect(granite.rateValue).toBeCloseTo(load / 20, 9);
      expect(both.rateValue).toBeCloseTo((2 * load) / 30, 9);

      const row = hoistingRow(m);
      const winch = row.parts
        .filter((part) => part.kind !== "runs")
        .reduce((sum, part) => sum + part.moves, 0);
      expect(winch).toBeGreaterThan(0);
      const can = row.parts.reduce((sum, part) => sum + part.moves, 0);
      const rates = strip.reduce((sum, cell) => sum + cell.rateValue, 0);
      expect(Math.abs(rates - (can - winch))).toBeLessThan(1e-9);
      expect(row.can).toBe(
        `${
          printedParts(
            row.parts.map((part) => part.moves),
            can,
          ).total
        }/s`,
      );
      expect(row.job).toBe("hoisting");
      expect(row.workers).toBe(5);
      expect(row.sum[0]).toContain("on winches");
    });
  });

  it("reads hoisting's counts and moves on the cages' one clock while a crew timer runs", () => {
    partThree(() => {
      const base = three();
      const now = 1_000;
      const m = {
        ...base,
        clocks: { ...base.clocks, "blasting-charge": now + 60_000 },
      };
      const timer = crewTimer(m, now);
      expect(timer).toBeGreaterThan(1);
      const still = hoistingRow(m);
      const row = hoistingRow(m, now);
      const running = mineWork(m).cages.filter((cage) => cage.runs);
      for (const part of row.parts) {
        if (part.kind === "runs") {
          expect(part.running).toBe(
            running.filter((cage) => cage.key.startsWith(`${part.id}:`)).length,
          );
        }
      }
      row.parts.forEach((part, index) => {
        expect(part.moves).toBeCloseTo(
          (still.parts[index]?.moves ?? 0) * timer,
          9,
        );
      });
      const winch = row.parts
        .filter((part) => part.kind !== "runs")
        .reduce((sum, part) => sum + part.moves, 0);
      const can = row.parts.reduce((sum, part) => sum + part.moves, 0);
      const rates = hoistStrip(m, now).reduce(
        (sum, cell) => sum + cell.rateValue,
        0,
      );
      expect(Math.abs(rates - (can - winch))).toBeLessThan(1e-9);
    });
  });

  it("darkens − at none and + with none left for both", () => {
    partThree(() => {
      const m = levels({
        topsoil: 1,
        granite: 1,
        hoisting: 3,
        hoists: 3,
        assigned: { topsoil: 0, granite: 3 },
      });
      const [topsoil, granite, both] = hoistStrip(m);
      expect(topsoil.canLess).toBe(false);
      expect(topsoil.canMore).toBe(false);
      expect(granite.canLess).toBe(true);
      expect(granite.canMore).toBe(false);
      expect(granite.unit).toBe("hoists");
      expect(both.count).toBe(0);
      expect(both.canLess).toBe(false);
      expect(both.canMore).toBe(false);
    });
  });

  it("lights + while a hoist is left for both", () => {
    partThree(() => {
      const [topsoil, , both] = hoistStrip(three());
      expect(topsoil.canMore).toBe(true);
      expect(both.canLess).toBe(false);
      expect(both.canMore).toBe(false);
    });
  });

  it("is today's hoisting row with one level", () => {
    partThree(() => {
      const m = levels({ topsoil: 2, hoisting: 2, hoists: 1, sunk: false });
      expect(hoistingRow(m).stage).toBe("lift");
      expect(hoistingRow(m).name).toBe("Hoisting");
    });
  });
});

describe("the shaft's gate", () => {
  it("tells the shaft's gate: waiting, then a price he can or cannot pay", () => {
    partThree(() => {
      expect(shaftGate(levels({ sunk: false, operational: [] }))).toEqual({
        kind: "waits",
        words: "The shaft can be sunk once the Light Tower is operational.",
      });
      const short = shaftGate(
        levels({ sunk: false, stock: { stones: 1e12, brick: 0 } }),
      );
      expect(short?.kind).toBe("open");
      if (short?.kind !== "open") {
        throw new Error("the shaft is not open");
      }
      expect(short.can).toBe(false);
      expect(short.price.map((line) => line.good)).toEqual(["stones", "brick"]);
      expect(short.price.map((line) => line.text)).toEqual(
        short.price.map((line) => formatCompact(line.amount)),
      );
      const rich = shaftGate(
        levels({ sunk: false, stock: { stones: 1e12, brick: 1e12 } }),
      );
      expect(rich?.kind === "open" && rich.can).toBe(true);
    });
  });

  it("has no gate once sunk, or with part 3 off", () => {
    expect(partThree(() => shaftGate(levels({})))).toBeUndefined();
    expect(partTwo(() => shaftGate(levels({ sunk: false })))).toBeUndefined();
  });
});

describe("the words with two levels", () => {
  it("asks which level a machine is for, by its kind", () => {
    expect(machineCardTitle("drill")).toBe("A drill for which level?");
    expect(machineCardTitle("cart")).toBe("A cart for which level?");
    expect(machineCardTitle("borer")).toBe("A borer for which level?");
    expect(machineCardTitle("train")).toBe("A train for which level?");
    expect(levelHasLine("topsoil", "drill", 2)).toBe("Topsoil: 2 drills");
    expect(levelHasLine("granite", "train", 1)).toBe("Granite: 1 train");
  });

  it("says no face, no hands and no limit", () => {
    const words = [
      HOIST_WAITS_LINE,
      GRANITE_NOT_REACHED,
      SHAFT_WAITS_LINE,
      SINK_KEY,
      SINK_LINE,
      MACHINE_CARD_STAYS,
      NOT_NOW,
      BOTH_IN_TURN,
      ...Object.values(LEVEL_NAMES),
      ...Object.values(WORKFORCE_GROUPS),
    ];
    for (const line of words) {
      expect(line).not.toMatch(/\bface\b|\bhands?\b|by hand|limit|bottleneck/i);
    }
    expect(WORKFORCE_GROUPS).toEqual({
      topsoil: "Topsoil",
      granite: "Granite",
      shaft: "Shaft",
    });
  });
});

describe("hoisting's now against its can", () => {
  /** What Hoisting's row can lift: its parts add up to it. */
  const canLift = (row: ReturnType<typeof hoistingRow>): number =>
    row.parts.reduce((sum, part) => sum + part.moves, 0);

  it("never lifts more now than it can, on the factory's dev mine with the Granite idle", () => {
    partThree(() => {
      // The part 3 dev save (tools/browser/fixtures.ts, `factoryGame`): the
      // shaft sunk, nobody on the Granite, and the winch the only cage.
      const read = readGame(
        {
          owned: { helper: 18, cart: 2 },
          stock: { stones: 420_000, brick: 60_000, clay: 8, iron: 11 },
          jobs: {
            drilling: 4,
            haulage: 3,
            hoisting: 4,
            driving: 2,
            building: 2,
            kilns: 1,
          },
          fleet: { horseWagon: 2 },
          marks: { operational: ["lightTower", "warehouse"] },
          makers: { kiln: 1 },
          granite: {},
          run: { rock: 30_000_000, granite: 1_000_000 },
          levels: { "iron-rails": 1 },
        },
        0,
      );
      if (read.kind !== "ok") {
        throw new Error(`the dev save reads ${read.kind}`);
      }
      const m = read.mountain;
      const row = hoistingRow(m);
      const now = mineLevelFlows(m).lift;
      expect(now).toBeGreaterThan(0);
      expect(now).toBeLessThanOrEqual(canLift(row) + 1e-9);
      // Only the Topsoil is in the turn, so the winch, which serves both,
      // brings up its whole load every Topsoil trip.
      const winch = mineWork(m).cages.find((cage) => cage.key === "winch");
      expect(canLift(row)).toBeCloseTo(
        (winch?.load ?? 0) / tripSeconds("topsoil"),
        9,
      );
    });
  });

  it("never lifts more now than it can with two levels, whatever the setup", () => {
    partThree(() => {
      for (const topsoil of [0, 3]) {
        for (const granite of [0, 2]) {
          for (const hoisting of [0, 2, 5]) {
            for (const hoists of [0, 1, 3]) {
              for (const assigned of [
                {},
                { topsoil: Math.min(1, hoists) },
                { granite: Math.min(1, hoists) },
              ]) {
                for (const shaft of [0, 100]) {
                  const m = levels({
                    topsoil,
                    granite,
                    hoisting,
                    hoists,
                    assigned,
                    piles: { shaft },
                    granitePiles: { shaft: 100 - shaft },
                  });
                  const now = mineLevelFlows(m).lift;
                  expect(now).toBeLessThanOrEqual(
                    canLift(hoistingRow(m)) + 1e-9,
                  );
                }
              }
            }
          }
        }
      }
    });
  });
});

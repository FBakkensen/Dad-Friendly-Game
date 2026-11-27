import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { formatCompact } from "./format";
import {
  largestLoad,
  shortestRound,
  tripSeconds,
  type ShaftCage,
} from "./cages";
import { makerInputRoom, makerTakes } from "./makers";
import { graniteChain, makerHolds, mineWork, topsoilChain } from "./mine-piles";
import { chainFlows, chainSpill, type Chain } from "./piles";
import { crewTimer } from "./rates";
import type { Mountain } from "./mountain";
import { PART_TWO_OFF } from "./part-switch";
import {
  BYPASS_RECIPE,
  makerRecipeLine,
  nightForecast,
  refineryView,
  steadySpill,
  type RefineryView,
} from "./refinery-view";
import { stockpileRoom } from "./stockyard";
import {
  levels,
  partThree,
  partThreeAsBuilt,
  slice2Part1,
  slice2Part2,
} from "./part-three.harness";
import { NO_LEVEL_MACHINES } from "./mine-levels";
import { crewedStart } from "./test-fixtures";

/** The refinery's numbers (slice 1, part 2, #671). */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0 }, body);

/** The Light Tower operational, the crew of 21 on the line, and these kilns. */
function lit({
  kilns = 0,
  onKilns = kilns,
  kilnPile = 0,
  stones = 0,
  brick = 0,
}: {
  kilns?: number;
  onKilns?: number;
  kilnPile?: number;
  stones?: number;
  brick?: number;
} = {}): Mountain {
  const start = crewedStart();
  return {
    ...start,
    owned: { ...start.owned, helper: start.owned.helper + onKilns },
    jobs: { ...start.jobs, kilns: onKilns },
    operational: ["lightTower"],
    makers: {
      kiln: kilns,
      saw: 0,
      glassworks: 0,
      partsPress: 0,
      precisionAssembly: 0,
    },
    piles: { face: 300, shaft: 300, kiln: kilnPile },
    stock: { ...start.stock, stones, brick },
  };
}

const view = (mountain: Mountain): RefineryView => refineryView(mountain);

/** The kilns' plate and the Topsoil's hopper: the first of each. */
function kilns(mountain: Mountain) {
  const refinery = view(mountain);
  const [plate] = refinery.plates;
  const [hopper] = refinery.hoppers;
  if (plate === undefined || hopper === undefined) {
    throw new Error("the refinery has no kilns' plate or no hopper");
  }
  return { ...refinery, plate, hopper };
}

/** Both levels drilling and hauling, a hoist each and one for both, every pile full, and these saws. */
const working = (saws = 0): Mountain =>
  levels({
    topsoil: 3,
    granite: 3,
    hoisting: 5,
    hoists: 3,
    assigned: { topsoil: 1, granite: 1 },
    saws,
    piles: { face: 300, shaft: 300 },
    granitePiles: { face: 300, shaft: 300 },
  });

describe("the kilns' plate (#671)", () => {
  it("reads like a stage's row: recipe, what they make of what they can, who runs, the pile", () => {
    partTwo(() => {
      const plate = kilns(lit({ kilns: 1, kilnPile: 120 })).plate;
      expect(plate.recipe).toBe("Recipe: 2 rock → 1 brick");
      expect(plate.name).toBe("Kilns");
      expect([plate.now, plate.can]).toEqual(["12", "12"]);
      expect(plate.unit).toBe("brick/s");
      expect(plate.machines).toBe("1 kiln: 1 of 1 worker");
      expect(plate.idle).toBeUndefined();
      expect(plate.pile).toBe("Rock at the kilns: 120 of 300");
      expect(plate.workers).toBe(1);
    });
  });

  it("says what runs when a kiln has no worker, and the workers with no kiln", () => {
    partTwo(() => {
      expect(kilns(lit({ kilns: 2, onKilns: 1 })).plate.machines).toBe(
        "1 of 2 kilns: 1 of 2 workers",
      );
      const over = kilns(lit({ kilns: 1, onKilns: 3 })).plate;
      expect(over.machines).toBe("1 kiln: 1 of 1 worker");
      expect(over.idle).toBe("+ 2 without a kiln");
    });
  });

  it("has no kilns yet, makes nothing, and every rock bypasses to stone", () => {
    partTwo(() => {
      const refinery = kilns(lit());
      expect(refinery.plate.machines).toBe("No kilns yet");
      expect([refinery.plate.now, refinery.plate.can]).toEqual(["0", "0"]);
      expect(refinery.plate.pile).toBeUndefined();
      expect(refinery.bypass.rate).toBe(refinery.hopper.rate);
      expect(refinery.bypass.recipe).toBe(BYPASS_RECIPE);
    });
  });

  it("with two levels, has the Topsoil's hoisted rock come in and bypass to stone with no kilns (#680)", () => {
    partThree(() => {
      // Each level hoists its own: a hoist for each, one for both. The Granite's rock goes to the saws' side.
      const refinery = kilns(working());
      expect(refinery.plate.machines).toBe("No kilns yet");
      expect(refinery.hopper.rate).not.toBe("0/s");
      // Both levels' rock bypasses: the chute is the hoppers' together (#754).
      const lifted = refinery.hoppers.reduce(
        (sum, each) => sum + each.lifted,
        0,
      );
      expect(refinery.bypass.rate).toBe(`${formatCompact(lifted)}/s`);
    });
  });

  it("makes no more than half the rock that comes in once its pile is empty", () => {
    partTwo(() => {
      // Six workers with tools on each stage lift 18 a second: 9 brick.
      const refinery = kilns(lit({ kilns: 1 }));
      expect(refinery.hopper.rate).toBe("18/s");
      expect([refinery.plate.now, refinery.plate.can]).toEqual(["9", "12"]);
      expect(refinery.bypass.rate).toBe("0/s");
    });
  });

  it("shows the recipe a lab sweep sets", () => {
    withFactors({ [PART_TWO_OFF]: 0, "recipe.kiln": 1.5 }, () => {
      expect(kilns(lit({ kilns: 1 })).plate.recipe).toBe(
        "Recipe: 3 rock → 1 brick",
      );
    });
  });

  it("offers one more kiln with what it makes, its price and the worker it takes", () => {
    partTwo(() => {
      expect(kilns(lit({ stones: 14_999 })).plate.key).toEqual({
        face: "+Kiln · 12/s",
        price: "15K",
        staff: "1 to run",
        can: false,
        label:
          "Buy a kiln for 15K stone. It makes 12 brick a second and takes 1 to run.",
        good: "stones",
      });
      expect(kilns(lit({ stones: 15_000 })).plate.key.can).toBe(true);
    });
  });
});

describe("a plate for each open maker (#754)", () => {
  it("shows the saws' plate once the Granite is sunk", () => {
    partThree(() => {
      const refinery = view(levels({ saws: 2 }));
      expect(refinery.plates.map((p) => p.name)).toEqual(["Kilns", "Saws"]);
      const saws = refinery.plates[1];
      expect(saws?.recipe).toBe("Recipe: 3 rock → 1 cut stone");
      expect(saws?.unit).toBe("cut stone/s");
      expect(saws?.machines).toBe("2 saws: 2 of 2 workers");
      expect(saws?.pile).toMatch(/^Rock at the saws: /);
      expect(saws?.job).toBe("saws");
      expect(saws?.key.face).toBe("+Saw · 30/s");
      expect(saws?.key.good).toBe("brick");
      expect(refinery.hoppers.map((h) => h.name)).toEqual([
        "Topsoil",
        "Granite",
      ]);
      expect(refinery.scene.saws).toEqual({
        hopper: 0,
        saws: 2,
        running: 2,
        lifting: false,
        making: false,
      });
    });
  });

  it("has rock fall on the saws' side only while the Granite lifts", () => {
    partThree(() => {
      const both = view(working(1));
      expect(both.hoppers.map((h) => h.lifted > 0)).toEqual([true, true]);
      expect(both.scene.lifting).toBe(true);
      expect(both.scene.saws?.lifting).toBe(true);
      // Only the Topsoil is worked and hoisted: the Granite's side stays still.
      const topsoil = view(
        levels({
          topsoil: 3,
          hoisting: 2,
          hoists: 1,
          saws: 1,
          piles: { face: 300, shaft: 300 },
        }),
      );
      expect(topsoil.scene.lifting).toBe(true);
      expect(topsoil.scene.saws?.lifting).toBe(false);
    });
  });

  it("says what a saw costs in brick and what it makes", () => {
    partThree(() => {
      const saws = view(levels({ stock: { brick: 25_000 } })).plates[1];
      expect(saws?.key).toEqual({
        face: "+Saw · 30/s",
        price: "25K",
        staff: "1 to run",
        can: true,
        label:
          "Buy a saw for 25K brick. It makes 30 cut stone a second and takes 1 to run.",
        good: "brick",
      });
      expect(view(levels({ saws: 1, onSaws: 3 })).plates[1]?.idle).toBe(
        "+ 2 without a saw",
      );
    });
  });

  it("keeps one plate and one hopper with the Granite shut, and with part 3 off", () => {
    const shut = partThree(() => view(levels({ sunk: false })));
    const off = partTwo(() => view(levels({})));
    for (const refinery of [shut, off]) {
      expect(refinery.plates.length).toBe(1);
      expect(refinery.hoppers.length).toBe(1);
      expect(refinery.scene.saws).toBeUndefined();
      const [plate] = refinery.plates;
      expect(plate?.name).toBe("Kilns");
      expect(plate?.recipe).toBe("Recipe: 2 rock → 1 brick");
      expect(plate?.unit).toBe("brick/s");
      expect(plate?.machines).toBe("No kilns yet");
      expect(plate?.job).toBe("kilns");
      expect(plate?.key.face).toBe("+Kiln · 12/s");
      expect(plate?.key.label).toBe(
        "Buy a kiln for 15K stone. It makes 12 brick a second and takes 1 to run.",
      );
      expect(refinery.hoppers[0]?.name).toBe("Topsoil");
    }
  });

  it("passes all the Granite's rock to stone with no saw", () => {
    // The rates as #724 and #680 built them, before #675 set the stages apart.
    partThreeAsBuilt(() => {
      const mountain = working();
      const refinery = view(mountain);
      const saws = refinery.plates[1];
      expect(saws?.pile).toBeUndefined();
      expect(saws?.machines).toBe("No saws yet");
      // Each level lifts its own (a hoist each, one for both in turn), and
      // with no kiln and no saw every rock of both reaches the chute.
      expect(refinery.hoppers.map((h) => h.rate)).toEqual(["82/s", "52/s"]);
      expect(refinery.bypass.rate).toBe("134/s");
    });
  });

  it("has no Granite chain with one level", () => {
    partThree(() => {
      expect(graniteChain(levels({ sunk: false }))).toBeUndefined();
    });
  });
});

describe("a steady bypass (#754)", () => {
  /** The Topsoil worked and hoisted by a hoist of its own, a kiln running, and rock at the kilns `room` short of full. */
  const fed = (room: number, sunk = false): Mountain => {
    const base = levels({
      sunk,
      topsoil: 3,
      hoisting: 2,
      hoists: 1,
      assigned: sunk ? { topsoil: 1 } : {},
      kilns: 1,
      piles: { face: 300, shaft: 300 },
    });
    const holds = makerHolds(base, "kiln");
    return { ...base, piles: { ...base.piles, kiln: holds - room } };
  };
  const load = (mountain: Mountain): number =>
    largestLoad(mineWork(mountain).cages);
  /** What the chain spills a second at this instant, as the view read it before. */
  const instant = (mountain: Mountain): string => {
    const chain = topsoilChain(mountain);
    return `${formatCompact(chainSpill(chain) * crewTimer())}/s`;
  };

  it("reads what the Topsoil lifts past the kilns while their pile is within a load of full", () => {
    partThree(() => {
      const full = fed(0);
      const under = fed(1);
      expect(load(under)).toBeGreaterThan(1);
      // The cages unload in loads: a pile a rock short of full spills nothing this instant.
      expect(instant(under)).toBe("0/s");
      const steady = view(under);
      expect(steady.bypass.rate).toBe(view(full).bypass.rate);
      expect(steady.bypass.rate).not.toBe("0/s");
      expect(steady.scene.bypassing).toBe(true);
      // The lift past the kilns: the hopper's rate less what the kilns take.
      const [kilnsPlate] = steady.plates;
      const [topsoil] = steady.hoppers;
      const takes = Number(kilnsPlate?.now) * makerTakes("kiln");
      expect(steady.bypass.rate).toBe(
        `${formatCompact((topsoil?.lifted ?? 0) - takes)}/s`,
      );
      // With room for more than a load, the pile is filling: nothing bypasses.
      const filling = view(fed(load(under) + 1));
      expect(filling.bypass.rate).toBe("0/s");
      expect(filling.scene.bypassing).toBe(false);
    });
  });

  it("bypasses all the Topsoil lifts while a full brick stockpile stops the kilns", () => {
    partThree(() => {
      const stopped = (room: number): Mountain => {
        const mountain = fed(room);
        const brick = stockpileRoom(mountain, "brick");
        return { ...mountain, stock: { ...mountain.stock, brick } };
      };
      const full = view(stopped(0));
      const [kilnsPlate] = full.plates;
      const [topsoil] = full.hoppers;
      expect(kilnsPlate?.now).toBe("0");
      expect(topsoil?.lifted ?? 0).toBeGreaterThan(0);
      // The kilns take nothing: every rock the Topsoil lifts goes past them.
      expect(full.bypass.rate).toBe(`${formatCompact(topsoil?.lifted ?? 0)}/s`);
      expect(full.scene.bypassing).toBe(true);
      // Nothing drains the pile between loads, so a pile with room is still filling: no stone yet.
      expect(view(stopped(1)).bypass.rate).toBe("0/s");
    });
  });

  /** A pile `room` short of 1,000, lifted into at `lift` and taken from at `take` a second, its overflow to stone. */
  const fill = (room: number, lift: number, take: number): Chain => ({
    source: Infinity,
    rates: [lift, take],
    piles: [{ held: 1_000 - room, holds: 1_000 }],
    spill: { from: 0, held: 0, holds: Infinity, drain: 0 },
  });

  /** One running hoist for the Topsoil alone. */
  const ownHoist: ShaftCage = {
    key: "hoist:0",
    load: 150,
    runs: true,
    serves: "topsoil",
  };

  it("shows no stone from a pile still filling from below (PR review)", () => {
    // A load every 5 s round trip, and the kilns take 24/s: a steady pile
    // drains 120 between loads, so 150 short and lifted into at 26/s it is filling.
    withFactors({ "trip.topsoil": 0.5 }, () => {
      const between = shortestRound([ownHoist], "topsoil");
      expect(between).toBe(5);
      expect(chainSpill(fill(0, 26, 24))).toBe(2);
      expect(steadySpill(fill(150, 26, 24), between)).toBe(0);
      expect(steadySpill(fill(120, 26, 24), between)).toBe(2);
    });
    // No cage serving the level (part 2 has none): the chain's own spill.
    expect(steadySpill(fill(1, 26, 24), 0)).toBe(0);
    expect(steadySpill(fill(0, 26, 24), 0)).toBe(2);
  });

  it("reads steady only within what the kilns take over a cage's round trip", () => {
    partThree(() => {
      const mountain = fed(0);
      const chain = topsoilChain(mountain);
      const flows = chainFlows(chain);
      const from = chain.spill?.from ?? 0;
      const takes = (flows[from + 1] ?? 0) * makerTakes("kiln");
      const round = shortestRound(mineWork(mountain).cages, "topsoil");
      expect(round).toBe(tripSeconds("topsoil"));
      const window = takes * round * crewTimer();
      expect(flows[from] ?? 0).toBeGreaterThan(takes);
      const steady = view(mountain).bypass.rate;
      expect(steady).not.toBe("0/s");
      expect(view(fed(Math.floor(window))).bypass.rate).toBe(steady);
      // Past the window the pile is filling, and the board says so: the chain's own spill.
      const filling = fed(Math.floor(window) + 1);
      expect(view(filling).bypass.rate).toBe("0/s");
      expect(view(filling).bypass.rate).toBe(instant(filling));
    });
  });

  it("reads as before with one level, whenever the pile is full or has room for more than a load", () => {
    partThree(() => {
      for (const mountain of [fed(0), fed(load(fed(0)) + 1)]) {
        expect(view(mountain).bypass.rate).toBe(instant(mountain));
      }
    });
    partTwo(() => {
      // Part 2 has no cages: no load, so the bypass is the chain's own, at any room.
      for (const room of [0, 1, 100]) {
        const mountain = lit({ kilns: 1, kilnPile: 300 - room });
        expect(view(mountain).bypass.rate).toBe(instant(mountain));
      }
    });
  });

  it("adds each level's steady bypass with the Granite open", () => {
    partThree(() => {
      const under = fed(1, true);
      expect(view(under).bypass.rate).toBe(view(fed(0, true)).bypass.rate);
      expect(view(under).bypass.rate).not.toBe("0/s");
    });
  });
});

describe("the stockyard (#671)", () => {
  it("has a bay for each stockpile, brick then stone, with its room", () => {
    partTwo(() => {
      const yard = view(lit({ stones: 33_200, brick: 20_800 })).stockyard;
      expect(yard.bays.map((bay) => bay.text)).toEqual([
        "Brick 20.8K of 1M",
        "Stone 33.2K of 6M",
      ]);
      expect(yard.bays.every((bay) => !bay.full)).toBe(true);
    });
  });

  it("marks a full stockpile", () => {
    partTwo(() => {
      const room = stockpileRoom(lit(), "brick");
      const yard = view(lit({ brick: room })).stockyard;
      expect(yard.bays[0]).toMatchObject({
        good: "brick",
        full: true,
        fill: 1,
      });
    });
  });

  it("offers the next level for its brick, and says what it gives", () => {
    partTwo(() => {
      const poor = view(lit({ brick: 149_999 })).stockyard.expand;
      expect(poor).toMatchObject({ price: "150K", can: false });
      expect(poor?.gives).toBe("Expansion: capacity ×3.");
      expect(view(lit({ brick: 150_000 })).stockyard.expand?.can).toBe(true);
    });
  });

  it("offers no level past the last", () => {
    partTwo(() => {
      expect(
        view({ ...lit(), stockyard: 18 }).stockyard.expand,
      ).toBeUndefined();
    });
  });
});

describe("how long a night lasts now (#671)", () => {
  it("says no output when nothing comes up", () => {
    partTwo(() => {
      const idle = {
        ...lit(),
        jobs: { ...lit().jobs, drilling: 0, haulage: 0, hoisting: 0 },
        piles: { face: 0, shaft: 0, kiln: 0 },
      };
      expect(nightForecast(idle, 0)).toBe("No output.");
    });
  });

  it("says it holds twelve hours while the stockyard has the room", () => {
    partTwo(() => {
      expect(nightForecast(lit(), 0)).toBe("Holds 12 h unattended.");
    });
  });

  it("says when a nearly full stockyard fills", () => {
    partTwo(() => {
      const room = stockpileRoom(lit(), "stones");
      expect(nightForecast(lit({ stones: room }), 0)).toBe("Full now.");
      // The line lifts 18 a second; the night shift under the Light Tower's
      // roof runs at 45%, 8.1 a second, so 5,400 stone fills in 667 s: 11 min.
      expect(nightForecast(lit({ stones: room - 5_400 }), 0)).toBe(
        "Full after 11 min unattended.",
      );
    });
  });

  it("reads makerBuffers, makerInputRoom, and physical transport rates under Slice 2 Part 1 (#769)", () => {
    slice2Part1(() => {
      const base = levels({ kilns: 1, saws: 1 });
      const state: Mountain = {
        ...base,
        owned: { ...base.owned, helper: base.owned.helper + 1 },
        jobs: { ...base.jobs, driving: 1 },
        pithead: { topsoil: 200, granite: 200, crystal: 0 },
        makerBuffers: {
          ...base.makerBuffers,
          kiln: { topsoilRock: 42 },
          saw: { graniteRock: 88 },
        },
      };
      const refinery = view(state);
      const [kilnPlate, sawPlate] = refinery.plates;
      const kilnRoom = makerInputRoom(state, "kiln");
      const sawRoom = makerInputRoom(state, "saw");
      expect(kilnPlate?.pile).toBe(
        `Rock at the kilns: 42 of ${formatCompact(kilnRoom)}`,
      );
      expect(sawPlate?.pile).toBe(
        `Rock at the saws: 88 of ${formatCompact(sawRoom)}`,
      );
      expect(refinery.bypass.rate).not.toBe("0/s");
    });
  });

  it("applies makerResearchMultiplier to makerKey output and shows Glassworks 2-buffer plate under Slice 2 Part 2 (#779)", () => {
    const base = levels({
      sunk: true,
      operational: ["lightTower", "warehouse", "foundry"],
      kilns: 1,
      saws: 1,
      driving: 2,
      stock: { stones: 50_000, brick: 200_000, cutStone: 200_000 },
    });
    const withCrystal: Mountain = {
      ...base,
      mineLevels: {
        ...base.mineLevels,
        crystal: {
          machines: NO_LEVEL_MACHINES,
          piles: { face: 0, shaft: 0, saw: 0 },
        },
      },
      makers: { ...base.makers, glassworks: 1 },
      jobs: { ...base.jobs, glassworks: 2 },
      owned: { ...base.owned, helper: base.owned.helper + 2 },
      makerBuffers: {
        kiln: { topsoilRock: 100 },
        saw: { graniteRock: 100 },
        glassworks: { crystalRock: 90, stones: 0 },
        partsPress: {},
        precisionAssembly: {},
      },
    };

    // Part 2 OFF: Glassworks plate stays hidden, only 3 bays.
    slice2Part1(() => {
      const off = view(withCrystal);
      expect(off.plates.map((p) => p.id)).toEqual(["kiln", "saw"]);
      expect(off.stockyard.bays.map((b) => b.good)).toEqual([
        "brick",
        "stones",
        "cutStone",
      ]);
    });

    // Part 2 ON: Glassworks plate appears with 2 input buffers, standing badge (stones buffer empty), 2-good key, 5 bays.
    slice2Part2(() => {
      const on = view(withCrystal);
      expect(on.plates.map((p) => p.id)).toEqual(["kiln", "saw", "glassworks"]);
      const gw = on.plates[2];
      expect(gw?.recipe).toBe("Recipe: 3 crystal rock + 2 stone → 1 glass");
      expect(gw?.buffers?.map((b) => b.id)).toEqual(["crystalRock", "stones"]);
      // Starved (no drivers feeding empty stones buffer) marks Glassworks standing.
      const starved = view({
        ...withCrystal,
        jobs: { ...withCrystal.jobs, driving: 0 },
      });
      expect(starved.plates[2]?.standing).toBe(true);
      expect(gw?.buffers?.[0]?.held).toBe(90);
      expect(gw?.buffers?.[1]?.empty).toBe(true);
      expect(gw?.key.face).toBe("+Glassworks · 25/s");
      expect(gw?.key.priceParts?.map((p) => p.good)).toEqual([
        "brick",
        "cutStone",
      ]);
      expect(on.stockyard.bays.map((b) => b.good)).toEqual([
        "brick",
        "stones",
        "cutStone",
        "glass",
        "parts",
      ]);

      // makerResearchMultiplier lifts Kilns (highDraftKilns +35%: 12 -> 16/s) and Glassworks (opticalGauges +40%: 25 -> 35/s).
      const researched: Mountain = {
        ...withCrystal,
        research: {
          done: ["highDraftKilns", "opticalGauges"],
        },
      };
      const boosted = view(researched);
      expect(boosted.plates[0]?.key.face).toBe("+Kiln · 16/s");
      expect(boosted.plates[2]?.key.face).toBe("+Glassworks · 35/s");
    });
  });

  it("formats singular and plural parts output in makerRecipeLine (#779)", () => {
    expect(makerRecipeLine("partsPress")).toBe(
      "Recipe: 2 brick + 2 cut stone → 1 part",
    );
    expect(makerRecipeLine("precisionAssembly")).toBe(
      "Recipe: 2 brick + 2 cut stone + 2 glass → 3 parts",
    );
  });
});

import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { formatCompact } from "./format";
import { chainSpill } from "./piles";
import { graniteChain, topsoilChain } from "./mine-piles";
import { crewTimer } from "./rates";
import type { Mountain } from "./mountain";
import { PART_TWO_OFF } from "./part-switch";
import {
  BYPASS_RECIPE,
  nightForecast,
  refineryView,
  type RefineryView,
} from "./refinery-view";
import { stockpileRoom } from "./stockyard";
import { levels, partThree } from "./part-three.harness";
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
    makers: { kiln: kilns, saw: 0 },
    piles: { face: 300, shaft: 300, kiln: kilnPile },
    stock: { ...start.stock, stones, brick },
  };
}

const view = (mountain: Mountain): RefineryView => refineryView(mountain, 0);

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
        making: false,
      });
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
    partThree(() => {
      const mountain = working();
      const refinery = view(mountain);
      const saws = refinery.plates[1];
      expect(saws?.pile).toBeUndefined();
      expect(saws?.machines).toBe("No saws yet");
      const granite = graniteChain(mountain);
      expect(granite).toBeDefined();
      const graniteSpill = granite === undefined ? 0 : chainSpill(granite);
      expect(graniteSpill).toBeGreaterThan(0);
      const both =
        (chainSpill(topsoilChain(mountain)) + graniteSpill) *
        crewTimer(mountain, 0);
      expect(refinery.bypass.rate).toBe(`${formatCompact(both)}/s`);
      expect(refinery.hoppers[1]?.lifted).toBeGreaterThan(0);
    });
  });

  it("has no Granite chain with one level", () => {
    partThree(() => {
      expect(graniteChain(levels({ sunk: false }))).toBeUndefined();
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
});

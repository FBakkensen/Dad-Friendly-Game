import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import type { Mountain } from "./mountain";
import { PART_TWO_OFF } from "./part-switch";
import {
  BYPASS_RECIPE,
  nightForecast,
  refineryView,
  type RefineryView,
} from "./refinery-view";
import { stockpileRoom } from "./stockyard";
import { crewedStart } from "./test-fixtures";

/** The refinery's numbers (slice 1, part 2, #671). */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

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
    makers: { kiln: kilns },
    piles: { face: 300, shaft: 300, kiln: kilnPile },
    stock: { ...start.stock, stones, brick },
  };
}

const view = (mountain: Mountain): RefineryView => refineryView(mountain, 0);

describe("the kilns' plate (#671)", () => {
  it("reads like a stage's row: recipe, what they make of what they can, who runs, the pile", () => {
    partTwo(() => {
      const plate = view(lit({ kilns: 1, kilnPile: 120 })).plate;
      expect(plate.recipe).toBe("Recipe: 2 rock → 1 brick");
      expect(plate.name).toBe("Kilns");
      expect([plate.now, plate.can]).toEqual(["12", "12"]);
      expect(plate.unit).toBe("brick/s");
      expect(plate.machines).toBe("1 kiln: 1 of 1 workers");
      expect(plate.idle).toBeUndefined();
      expect(plate.pile).toBe("Rock at the kilns: 120 of 300");
      expect(plate.workers).toBe(1);
    });
  });

  it("says what runs when a kiln has no worker, and the workers with no kiln", () => {
    partTwo(() => {
      expect(view(lit({ kilns: 2, onKilns: 1 })).plate.machines).toBe(
        "1 of 2 kilns: 1 of 2 workers",
      );
      const over = view(lit({ kilns: 1, onKilns: 3 })).plate;
      expect(over.machines).toBe("1 kiln: 1 of 1 workers");
      expect(over.idle).toBe("+ 2 without a kiln");
    });
  });

  it("has no kilns yet, makes nothing, and every rock bypasses to stone", () => {
    partTwo(() => {
      const refinery = view(lit());
      expect(refinery.plate.machines).toBe("No kilns yet");
      expect([refinery.plate.now, refinery.plate.can]).toEqual(["0", "0"]);
      expect(refinery.plate.pile).toBeUndefined();
      expect(refinery.bypass.rate).toBe(refinery.hopper.rate);
      expect(refinery.bypass.recipe).toBe(BYPASS_RECIPE);
    });
  });

  it("makes no more than half the rock that comes in once its pile is empty", () => {
    partTwo(() => {
      // Six workers with tools on each stage lift 18 a second: 9 brick.
      const refinery = view(lit({ kilns: 1 }));
      expect(refinery.hopper.rate).toBe("18/s");
      expect([refinery.plate.now, refinery.plate.can]).toEqual(["9", "12"]);
      expect(refinery.bypass.rate).toBe("0/s");
    });
  });

  it("shows the recipe a lab sweep sets", () => {
    withFactors(
      { [FRESH_OFF]: 0, [PART_TWO_OFF]: 0, "recipe.kiln": 1.5 },
      () => {
        expect(view(lit({ kilns: 1 })).plate.recipe).toBe(
          "Recipe: 3 rock → 1 brick",
        );
      },
    );
  });

  it("offers one more kiln with what it makes, its price and the worker it takes", () => {
    partTwo(() => {
      expect(view(lit({ stones: 14_999 })).plate.key).toEqual({
        face: "+Kiln · 12/s",
        price: "15K",
        staff: "1 to run",
        can: false,
        label: "Buy a kiln for 15K stone: 12 brick a second, 1 worker to run",
      });
      expect(view(lit({ stones: 15_000 })).plate.key.can).toBe(true);
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
      // The night lifts about 5 a second: 5,400 stone is roughly 18 minutes.
      expect(nightForecast(lit({ stones: room - 5_400 }), 0)).toMatch(
        /^Full after \d+ min unattended\.$/,
      );
    });
  });
});

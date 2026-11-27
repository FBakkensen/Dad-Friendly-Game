/**
 * Seed saves shared by the real-browser scripts: the visual check
 * (scripts/visual-check.mjs), the screen audit (scripts/ui-audit.mjs), the
 * play-test shots (scripts/play.mjs) and the gameplay journeys
 * (tools/journeys). Each is what a tab finds in localStorage on its first
 * load. Today's mountain's seeds went with the old board (#738).
 */

export { SAVE_KEY } from "./harness.ts";

/** A stored value, written as it is: a slice 1 save, a later build's save, or a bare value. */
export type SeedSave = {
  readonly [key: string]: unknown;
};

/** The stored JSON for a seed save. */
export function seedJson(save: SeedSave): string {
  return JSON.stringify(save);
}

/** A save a later build wrote: this build opens the update card and writes nothing (#558). */
export function newerSave(now: number): SeedSave {
  return { version: 12, lastSeen: now, game: {} };
}

const HOUR = 60 * 60 * 1000;

/** The account a memory save (`?memorySave=1`) signs in as (src/boot.ts, `MEMORY_DEV`). */
export const DEV_UID = "dev-dad";

/**
 * Where the phone keeps that account's backup (src/phone-backup.ts). The
 * frame's play saves are seeded here and played on a memory save as that
 * account, so the save line reads the account (#659, #664).
 */
export const DEV_BACKUP_KEY = `dad-friendly-game-backup:${DEV_UID}`;

/**
 * The same save as a guest's, for SAVE_KEY: the document inside a phone backup, without the
 * account (the journeys play as a guest, #664).
 */
export function asGuest(backup: SeedSave): SeedSave {
  const save = backup["save"];
  if (typeof save !== "object" || save === null) {
    throw new Error("Not a phone backup");
  }
  return save as SeedSave;
}

/** A save in the live v11 format: the phone backup of the dev account holding this game map. */
function sliceSave(now: number, game: Record<string, unknown>): SeedSave {
  return { uid: DEV_UID, save: { version: 11, lastSeen: now, game } };
}

/** The fresh mine's twelve workers, as the first evening places them. */
const FIRST_EVENING_JOBS = {
  drilling: 3,
  haulage: 3,
  hoisting: 3,
  driving: 1,
  building: 2,
};

/**
 * A fresh start a minute or so in (#703): one worker, on drilling, the
 * given horse wagon, nothing ordered, and some drilled rock waiting.
 * The frame opens on the first evening's card.
 */
export function sliceStartSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 1 },
    jobs: { drilling: 1 },
    fleet: { horseWagon: 1 },
    piles: { face: 120 },
  });
}

/**
 * The Light Tower's foundation on order, nothing in the pocket: transport
 * takes each stone as it is hoisted, so nothing is affordable and the line
 * runs. Next's "nothing" line (#659).
 */
export function sliceOrderedSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 12 },
    jobs: FIRST_EVENING_JOBS,
    fleet: { horseWagon: 1 },
    project: {
      building: "lightTower",
      state: "delivering",
      step: 0,
      arrived: { stones: 1_400 },
      onSite: { stones: 200 },
    },
  });
}

/** The same, with nobody hoisting: the line moves nothing, and stands. */
export function sliceStandsSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 12 },
    jobs: { ...FIRST_EVENING_JOBS, hoisting: 0 },
    fleet: { horseWagon: 1 },
    project: {
      building: "lightTower",
      state: "delivering",
      step: 0,
      arrived: { stones: 1_400 },
      onSite: { stones: 200 },
    },
  });
}

/**
 * The Light Tower's structure rising (#662): 150K of its 250K built in, 300
 * on the site, and a second wagon with nobody to drive it, behind the road.
 */
export function sliceStructureSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 14, cart: 2 },
    stock: { stones: 40_000 },
    jobs: { drilling: 4, haulage: 3, hoisting: 4, driving: 1, building: 2 },
    fleet: { horseWagon: 2 },
    project: {
      building: "lightTower",
      state: "delivering",
      step: 1,
      arrived: { stones: 150_300 },
      onSite: { stones: 300 },
    },
  });
}

/**
 * After the last roof that is live (#662; part 2's in #672, the slice's
 * since #682): the shaft sunk, the Light Tower, the Warehouse and the
 * Foundry operational and nothing to order, so the city's card says the
 * city is planning its next building.
 */
export function sliceDoneSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 15, cart: 2 },
    stock: { stones: 120_000, brick: 40_000, cutStone: 20_000 },
    jobs: {
      drilling: 4,
      haulage: 3,
      hoisting: 4,
      driving: 1,
      building: 2,
      kilns: 1,
    },
    fleet: { horseWagon: 2 },
    marks: { operational: ["lightTower", "warehouse", "foundry"] },
    makers: { kiln: 1 },
    mineLevels: { granite: {} },
    run: { rock: 30_000_000 },
  });
}

/**
 * A save from part 1 after its last roof, as a player had it when part 2 was
 * switched on (#672): the Light Tower operational, nothing ordered, no kiln,
 * and more stone than the stockyard's room, since part 1 had none. Its first
 * session greets with the refinery's card.
 */
export function slicePartOneDoneSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 14, cart: 2 },
    stock: { stones: 8_000_000 },
    jobs: { drilling: 4, haulage: 3, hoisting: 4, driving: 1, building: 2 },
    fleet: { horseWagon: 2 },
    marks: { operational: ["lightTower"] },
  });
}

/**
 * The Warehouse's structure going up (#672): the Light Tower operational,
 * the Warehouse's foundation built in, and stone and brick on their way on
 * the second plot.
 */
export function sliceWarehouseSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 18, cart: 2 },
    stock: { stones: 420_000, brick: 60_000 },
    jobs: {
      drilling: 4,
      haulage: 3,
      hoisting: 4,
      driving: 1,
      building: 2,
      kilns: 1,
    },
    fleet: { horseWagon: 2 },
    marks: { operational: ["lightTower"] },
    makers: { kiln: 1 },
    piles: { face: 200, shaft: 150 },
    pithead: { topsoil: 180 },
    makerBuffers: { kiln: { topsoilRock: 120 } },
    project: {
      building: "warehouse",
      state: "delivering",
      step: 1,
      arrived: { stones: 6_000_000, brick: 1_500_000 },
      onSite: { stones: 200, brick: 100 },
    },
  });
}

/**
 * The Warehouse's roof a thousand brick short, closed twelve hours ago: the
 * night delivers it, the builders build it in, and the frame opens on the
 * report, then the Warehouse's card: in part 3 it opens trucks, and the
 * Foundry is next (#672, #682).
 */
export function sliceWarehouseRoofSave(now: number): SeedSave {
  return sliceSave(now - 12 * HOUR, {
    owned: { helper: 13 },
    jobs: { ...FIRST_EVENING_JOBS, kilns: 1 },
    fleet: { horseWagon: 1 },
    stock: { brick: 1_000 },
    marks: { operational: ["lightTower"] },
    makers: { kiln: 1 },
    project: {
      building: "warehouse",
      state: "delivering",
      step: 2,
      arrived: { brick: 11_999_000 },
    },
  });
}

/**
 * The Foundry's structure going up (#682): the shaft sunk, the Light Tower
 * and the Warehouse operational, a saw with its worker, and brick and cut
 * stone on their way to the third plot.
 */
export function sliceFoundrySave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 20, cart: 2 },
    stock: { stones: 420_000, brick: 60_000, cutStone: 20_000 },
    jobs: {
      drilling: 4,
      haulage: 3,
      hoisting: 4,
      driving: 1,
      building: 2,
      kilns: 1,
      saws: 1,
    },
    fleet: { horseWagon: 2 },
    marks: { operational: ["lightTower", "warehouse"] },
    makers: { kiln: 1, saw: 1 },
    mineLevels: { granite: {} },
    run: { rock: 30_000_000 },
    project: {
      building: "foundry",
      state: "delivering",
      step: 1,
      arrived: { brick: 8_000_000, cutStone: 5_000_000 },
      onSite: { brick: 200, cutStone: 100 },
    },
  });
}

/**
 * The Foundry's roof a thousand cut stone short, closed twelve hours ago
 * (#682): the shaft sunk, the Light Tower and the Warehouse operational. The
 * night delivers it, the builders build it in, and the frame opens on the
 * report, then the slice's end card.
 */
export function sliceFoundryRoofSave(now: number): SeedSave {
  return sliceSave(now - 12 * HOUR, {
    owned: { helper: 14 },
    jobs: { ...FIRST_EVENING_JOBS, kilns: 1, saws: 1 },
    fleet: { horseWagon: 1 },
    stock: { cutStone: 1_000 },
    marks: { operational: ["lightTower", "warehouse"] },
    makers: { kiln: 1, saw: 1 },
    mineLevels: { granite: {} },
    run: { rock: 30_000_000 },
    project: {
      building: "foundry",
      state: "delivering",
      step: 2,
      arrived: { brick: 30_000_000, cutStone: 39_999_000 },
    },
  });
}

/**
 * Part 2 (#671): the Light Tower operational, a
 * kiln with its worker, rock at the kilns, and stone and brick in the
 * stockyard. The refinery's tab is in the site bar.
 */
export function sliceRefinerySave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 18, cart: 2 },
    stock: { stones: 420_000, brick: 18_000 },
    jobs: {
      drilling: 4,
      haulage: 3,
      hoisting: 4,
      driving: 2,
      building: 2,
      kilns: 1,
    },
    fleet: { horseWagon: 2 },
    marks: { operational: ["lightTower"] },
    makers: { kiln: 1 },
    piles: { face: 200, shaft: 150 },
    pithead: { topsoil: 180 },
    makerBuffers: { kiln: { topsoilRock: 120 } },
  });
}

/**
 * The same refinery closed twelve hours ago with its stockyard nearly full
 * and nothing ordered: the night fills both stockpiles, the mine stands, and
 * the shift report says the stockyard stopped it (#671).
 */
export function sliceYardFullSave(now: number): SeedSave {
  return sliceSave(now - 12 * HOUR, {
    owned: { helper: 18, cart: 2 },
    stock: { stones: 5_900_000, brick: 990_000 },
    jobs: {
      drilling: 4,
      haulage: 3,
      hoisting: 4,
      driving: 2,
      building: 2,
      kilns: 1,
    },
    fleet: { horseWagon: 2 },
    marks: { operational: ["lightTower"] },
    makers: { kiln: 1 },
    piles: { face: 200, shaft: 150 },
    pithead: { topsoil: 180 },
    makerBuffers: { kiln: { topsoilRock: 120 } },
  });
}

/**
 * A busier first night: two carts, a second wagon, three free workers, the
 * foundation on order and stone in the pocket. Next counts the mine's and
 * transport's buys, and the workforce shows machines that run (#659).
 */
export function sliceBusySave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 16, cart: 2 },
    stock: { stones: 60_000 },
    jobs: { drilling: 4, haulage: 3, hoisting: 3, driving: 1, building: 2 },
    fleet: { horseWagon: 2 },
    project: {
      building: "lightTower",
      state: "delivering",
      step: 0,
      arrived: { stones: 23_700 },
      onSite: { stones: 400 },
    },
  });
}

/**
 * The foundation on order, closed nine hours ago: the frame opens on the
 * shift report of a night (#663), the mine stopped by the eight-hour clock.
 */
export function sliceNightSave(now: number): SeedSave {
  return sliceSave(now - 9 * HOUR, {
    owned: { helper: 12 },
    jobs: FIRST_EVENING_JOBS,
    fleet: { horseWagon: 1 },
    stock: { stones: 4_000 },
    project: {
      building: "lightTower",
      state: "delivering",
      step: 0,
      arrived: { stones: 1_400 },
      onSite: { stones: 200 },
    },
  });
}

/**
 * The Light Tower's roof a thousand stone short, closed twelve hours ago:
 * the night delivers it, the builders build it in, and the frame opens on
 * the report, then the end card (#663).
 */
export function sliceRoofSave(now: number): SeedSave {
  return sliceSave(now - 12 * HOUR, {
    owned: { helper: 12 },
    jobs: FIRST_EVENING_JOBS,
    fleet: { horseWagon: 1 },
    stock: { stones: 1_000 },
    project: {
      building: "lightTower",
      state: "delivering",
      step: 2,
      arrived: { stones: 999_000 },
    },
  });
}

/**
 * A grown first stretch: five carts and five drills, so Loading crews and
 * Haul roads are open in their stages' lists, thirty workers for Work
 * boots in the workforce, and the stone for all three (#661).
 */
export function sliceListSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 30, cart: 6, drill: 5, hoist: 3 },
    stock: { stones: 3_000_000 },
    jobs: { drilling: 8, haulage: 9, hoisting: 8, driving: 1, building: 2 },
    fleet: { horseWagon: 2 },
    project: {
      building: "lightTower",
      state: "delivering",
      step: 0,
      arrived: { stones: 23_700 },
      onSite: { stones: 400 },
    },
  });
}

/**
 * Part 3 (#680): the Light Tower and the
 * Warehouse operational, the stockyard expanded once, and the stone and
 * brick in it to sink the shaft, which is not yet sunk. The mine shows the
 * Granite's plate under the Topsoil, with the Sink key lit.
 */
export function sliceGraniteUnsunkSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 18, cart: 2, drill: 1, hoist: 2 },
    stock: { stones: 12_000_000, brick: 2_000_000 },
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
    stockyard: 1,
    piles: { face: 200, shaft: 150 },
    pithead: { topsoil: 180 },
    makerBuffers: { kiln: { topsoilRock: 120 } },
    run: { rock: 30_000_000 },
  });
}

/**
 * Part 3 (#754): the Light Tower and the
 * Warehouse operational, two wagons with their drivers, and the brick for a
 * truck. The Transport sheet has the truck key beside the wagon's.
 */
export function sliceWarehouseTrucksSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 16, cart: 2 },
    stock: { stones: 120_000, brick: 200_000 },
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
  });
}

/**
 * Part 3 (#680): the shaft sunk, both levels
 * working on their own workers and machines, a hoist assigned to each
 * level and one for both in turn, rock in every level's piles, two free
 * workers, the cut stone to buy a borer for either level, and in the
 * refinery a kiln with its worker and two saws with one, the brick for
 * another saw, and both makers' buffers fed (#754, #769).
 */
export function sliceTwoLevelsSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 25, cart: 3, drill: 2, hoist: 3 },
    stock: {
      stones: 2_000_000,
      brick: 200_000,
      cutStone: 100_000,
    },
    jobs: {
      drilling: 4,
      haulage: 3,
      hoisting: 5,
      graniteDrilling: 3,
      graniteHaulage: 2,
      driving: 2,
      building: 2,
      kilns: 1,
      saws: 1,
    },
    fleet: { horseWagon: 2 },
    marks: { operational: ["lightTower", "warehouse"] },
    makers: { kiln: 1, saw: 2 },
    piles: { face: 200, shaft: 150 },
    mineLevels: {
      granite: {
        machines: { cart: 1, drill: 1 },
        piles: { face: 150, shaft: 120 },
      },
    },
    pithead: { topsoil: 240, granite: 180 },
    makerBuffers: {
      kiln: { topsoilRock: 420 },
      saw: { graniteRock: 310 },
    },
    cages: { assigned: { topsoil: 1, granite: 1 } },
    run: { rock: 30_000_000 },
  });
}

/**
 * Slice 2 Part 1 (#768): two levels open, Light Tower & Warehouse operational,
 * Foundry structure delivering Brick and Cut stone with per-good on-site
 * buffers, Kiln and Saw running, 2 wagons + 1 truck with 2 drivers (1
 * unstaffed -> amber Transport chip), and stockpiles for +Wagon and +Truck.
 */
export function slice2Part1Save(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 28, cart: 3, drill: 2, hoist: 3 },
    stock: {
      stones: 2_000_000,
      brick: 250_000,
      cutStone: 120_000,
    },
    jobs: {
      drilling: 4,
      haulage: 3,
      hoisting: 5,
      graniteDrilling: 3,
      graniteHaulage: 2,
      driving: 2,
      building: 2,
      kilns: 1,
      saws: 1,
    },
    fleet: { horseWagon: 2, truck: 1 },
    marks: { operational: ["lightTower", "warehouse"] },
    makers: { kiln: 1, saw: 2 },
    piles: { face: 180, shaft: 140 },
    mineLevels: {
      granite: {
        machines: { cart: 1, drill: 1 },
        piles: { face: 160, shaft: 110 },
      },
    },
    pithead: { topsoil: 240, granite: 180 },
    makerBuffers: {
      kiln: { topsoilRock: 420 },
      saw: { graniteRock: 310 },
    },
    project: {
      building: "foundry",
      state: "delivering",
      step: 1,
      arrived: { brick: 1_200_000, cutStone: 400_000 },
      onSite: { brick: 280, cutStone: 160 },
    },
    cages: { assigned: { topsoil: 1, granite: 1 } },
    run: { rock: 30_000_000 },
  });
}

/**
 * Slice 2 Part 1 (#768): two levels open with zero drivers and Granite pithead
 * filled to room, showing the visible pithead-full stall on Hoisting's row.
 */
export function slice2Part1PitheadFullSave(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 22, cart: 2, drill: 1, hoist: 0 },
    stock: {
      stones: 400_000,
      brick: 80_000,
      cutStone: 40_000,
    },
    jobs: {
      drilling: 3,
      haulage: 3,
      hoisting: 3,
      graniteDrilling: 3,
      graniteHaulage: 2,
      driving: 0,
      building: 1,
      kilns: 1,
      saws: 1,
    },
    fleet: { horseWagon: 2, truck: 0 },
    marks: { operational: ["lightTower", "warehouse"] },
    makers: { kiln: 1, saw: 1 },
    piles: { face: 120, shaft: 100 },
    mineLevels: {
      granite: {
        machines: { cart: 1, drill: 1 },
        piles: { face: 140, shaft: 120 },
      },
    },
    pithead: { topsoil: 90, granite: 810 },
    run: { rock: 30_000_000 },
  });
}

/**
 * Slice 2 Part 2 (#779): all 3 mine levels open (Topsoil, Granite, Crystal
 * Caves), 4 hoists split across levels + All in turn, Refinery with Kilns,
 * Saws & Glassworks (2 input buffers), steady-flow Factory with Parts Press
 * (2 buffers), Precision Assembly (3 buffers) & Parts output buffer, City
 * with 4 plots (including Research Lab operational) and 1 installed + 1
 * active delivering research project.
 */
export function slice2Part2Save(now: number): SeedSave {
  return sliceSave(now, {
    owned: { helper: 42, cart: 4, drill: 3, hoist: 4 },
    stock: {
      stones: 3_000_000,
      brick: 600_000,
      cutStone: 400_000,
      glass: 120_000,
      parts: 80_000,
    },
    jobs: {
      drilling: 4,
      haulage: 3,
      hoisting: 6,
      graniteDrilling: 3,
      graniteHaulage: 2,
      crystalDrilling: 3,
      crystalHaulage: 2,
      driving: 3,
      building: 2,
      kilns: 2,
      saws: 2,
      glassworks: 2,
      partsPress: 2,
      precisionAssembly: 3,
    },
    fleet: { horseWagon: 2, truck: 2 },
    marks: {
      operational: ["lightTower", "warehouse", "foundry", "researchLab"],
    },
    makers: {
      kiln: 2,
      saw: 2,
      glassworks: 1,
      partsPress: 1,
      precisionAssembly: 1,
    },
    piles: { face: 180, shaft: 140 },
    mineLevels: {
      granite: {
        machines: { cart: 1, drill: 1 },
        piles: { face: 160, shaft: 110 },
      },
      crystal: {
        machines: { cart: 1, drill: 1 },
        piles: { face: 120, shaft: 90 },
      },
    },
    pithead: { topsoil: 240, granite: 180, crystal: 120 },
    makerBuffers: {
      kiln: { topsoilRock: 420 },
      saw: { graniteRock: 310 },
      glassworks: { crystalRock: 360, stones: 240 },
      partsPress: { brick: 420, cutStone: 210 },
      precisionAssembly: { brick: 260, cutStone: 180, glass: 120 },
    },
    factoryOutput: { parts: 140 },
    research: {
      done: ["workBoots"],
      active: {
        id: "heavyCouplings",
        arrived: { parts: 180_000, glass: 3_500_000 },
      },
    },
    cages: { assigned: { topsoil: 1, granite: 1, crystal: 1 } },
    run: { rock: 60_000_000 },
  });
}

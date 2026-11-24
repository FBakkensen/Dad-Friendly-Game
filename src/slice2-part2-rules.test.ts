import { describe, expect, it } from "vitest";
import { nextBuilding, placeOrder } from "./city";
import { applyMove, listActions, valueOf } from "./economy/actions";
import { withFactors } from "./economy/factors";
import {
  distributeFactoryInput,
  factoryInputOpen,
  factoryInputRoomTotal,
  factoryMakers,
  factoryOpen,
  factoryOutputRoom,
  hasOwnedFactoryLine,
} from "./factory";
import { fieldEntry } from "./field-log";
import { sticker } from "./lab/decide";
import {
  buyMaker,
  makerInputRoom,
  makerMakes,
  makerOpen,
  makerPrice,
  makerPriceAt,
  makerQuote,
  makerRate,
  makerWorkersPerUnit,
  refineryMakers,
  runningMakers,
  stepMakerCycle,
} from "./makers";
import { sinkShaft } from "./mine-levels";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import {
  PART_THREE_OFF,
  PART_TWO_OFF,
  SLICE_2_PART_1_OFF,
  SLICE_2_PART_2_OFF,
} from "./part-switch";
import { levels, slice2Part1 } from "./part-three.harness";
import { effectiveRates } from "./rates";
import {
  RESEARCH_IDS,
  RESEARCH_PROJECTS,
  cancelResearch,
  installResearch,
  ironRailsMultiplier,
  makerResearchMultiplier,
  researchAvailable,
  researchDone,
  researchOpen,
  researchPrice,
  researchReady,
  startResearch,
  transportResearchMultiplier,
} from "./research";
import { readGame, writeGame } from "./save-format";
import { mergeSaves } from "./save-merge";
import { accrueSlice2Live, accrueSlice2Stretches } from "./slice2-flow";
import { EMPTY_STOCK, priceAmount } from "./stock";
import { deadStockpiles, stockpileRoom } from "./stockyard";
import { quotePriceRun } from "./tiers";
import {
  RUN_ORDER,
  fleetRate,
  planTransportTransfer,
  runSnapshots,
  vehiclePriceQuote,
} from "./transport";
import { BOOTS_SPEED_PER_LEVEL, buyUpgrade } from "./upgrades";
import { jobOpen, placeWorker } from "./workforce";

const SLICE_2_PART_2_FACTORS = {
  [PART_TWO_OFF]: 0,
  [PART_THREE_OFF]: 0,
  [SLICE_2_PART_1_OFF]: 0,
  [SLICE_2_PART_2_OFF]: 0,
} as const;

const slice2Part2 = <T>(body: () => T): T =>
  withFactors(SLICE_2_PART_2_FACTORS, body);

const SECOND = 1_000;
const HOUR = 3_600 * SECOND;

/** Rich Part 2 mountain with Foundry + Crystal Caves sunk and plenty of crew/stock. */
function part2Mountain(): Mountain {
  const base = levels({
    sunk: true,
    operational: ["lightTower", "warehouse", "foundry"],
    topsoil: 4,
    granite: 4,
    hoisting: 6,
    hoists: 4,
    driving: 6,
    fleet: { horseWagon: 6, truck: 2 },
  });
  const rich: Mountain = {
    ...base,
    owned: { ...base.owned, helper: base.owned.helper + 40 },
    stock: {
      ...EMPTY_STOCK,
      stones: 100_000_000,
      brick: 100_000_000,
      cutStone: 100_000_000,
      glass: 50_000_000,
      parts: 40_000_000,
    },
  };
  return slice2Part2(() => sinkShaft(rich, "crystal"));
}

describe("multi-good price quoting (#771)", () => {
  it("quotes one, ten, and max bounded by the tightest good line", () => {
    const curve = (nth: number) => [
      { good: "brick" as const, amount: 100 * (nth + 1) },
      { good: "cutStone" as const, amount: 50 * (nth + 1) },
    ];
    const stock = {
      ...EMPTY_STOCK,
      brick: 600, // affords 3 (100+200+300)
      cutStone: 160, // affords 2 (50+100=150, 3rd needs 300)
    };
    expect(quotePriceRun(curve, "one", stock)).toEqual({
      count: 1,
      price: [
        { good: "brick", amount: 100 },
        { good: "cutStone", amount: 50 },
      ],
    });
    expect(quotePriceRun(curve, "ten", stock)).toEqual({
      count: 10,
      price: [
        { good: "brick", amount: 5_500 },
        { good: "cutStone", amount: 2_750 },
      ],
    });
    expect(quotePriceRun(curve, "max", stock)).toEqual({
      count: 2,
      price: [
        { good: "brick", amount: 300 },
        { good: "cutStone", amount: 150 },
      ],
    });
    // Still quotes 1 when none are affordable.
    expect(quotePriceRun(curve, "max", EMPTY_STOCK)).toEqual({
      count: 1,
      price: [
        { good: "brick", amount: 100 },
        { good: "cutStone", amount: 50 },
      ],
    });
  });

  it("exposes multi-good makerQuote, makerPriceAt, and vehiclePriceQuote", () => {
    slice2Part2(() => {
      const m = part2Mountain();
      const firstGlass = makerPriceAt(0, "glassworks");
      expect(priceAmount(firstGlass, "brick")).toBeGreaterThan(0);
      expect(priceAmount(firstGlass, "cutStone")).toBeGreaterThan(0);
      expect(makerQuote(m, "glassworks", "one")).toEqual({
        count: 1,
        price: makerPrice(m, "glassworks"),
      });
      const tenQuote = makerQuote(m, "partsPress", "ten");
      expect(tenQuote.count).toBe(10);
      expect(priceAmount(tenQuote.price, "brick")).toBeGreaterThan(
        priceAmount(makerPriceAt(0, "partsPress"), "brick"),
      );
      const tightStock: Mountain = {
        ...m,
        stock: { ...EMPTY_STOCK, brick: 10_000_000, cutStone: 1_000 },
      };
      const maxQuote = makerQuote(tightStock, "partsPress", "max");
      expect(maxQuote.count).toBe(1);

      const wagonQuote = vehiclePriceQuote(m, "horseWagon", "one");
      expect(wagonQuote.count).toBe(1);
      expect(wagonQuote.price.length).toBeGreaterThan(0);
    });
  });
});

describe("unified 5-good stockyard and deadStockpiles (#771)", () => {
  it("gates glass and parts stockpile room on slice2Part2On()", () => {
    const m = part2Mountain();
    slice2Part1(() => {
      expect(stockpileRoom(m, "stones")).toBeGreaterThan(0);
      expect(stockpileRoom(m, "brick")).toBeGreaterThan(0);
      expect(stockpileRoom(m, "cutStone")).toBeGreaterThan(0);
      expect(stockpileRoom(m, "glass")).toBe(Infinity);
      expect(stockpileRoom(m, "parts")).toBe(Infinity);
    });
    slice2Part2(() => {
      expect(stockpileRoom(m, "glass")).toBeGreaterThan(0);
      expect(stockpileRoom(m, "parts")).toBeGreaterThan(0);
      expect(stockpileRoom(m, "glass")).toBeLessThan(
        stockpileRoom(m, "cutStone"),
      );
      expect(stockpileRoom(m, "parts")).toBeLessThan(stockpileRoom(m, "glass"));
    });
  });

  it("counts Glassworks, Factory, City, and Research demand in deadStockpiles under Part 2", () => {
    slice2Part2(() => {
      const m = part2Mountain();
      const full: Mountain = {
        ...m,
        operational: [...m.operational, "researchLab"],
        stock: {
          stones: stockpileRoom(m, "stones"),
          brick: stockpileRoom(m, "brick"),
          cutStone: stockpileRoom(m, "cutStone"),
          glass: stockpileRoom(m, "glass"),
          parts: stockpileRoom(m, "parts"),
        },
      };
      // Nothing consumes any good -> all 5 are dead.
      expect(deadStockpiles(full)).toEqual([
        "stones",
        "brick",
        "cutStone",
        "glass",
        "parts",
      ]);

      // Owning a Glassworks wakes stones; owning a Parts Press wakes brick & cutStone;
      // owning Precision Assembly wakes glass; starting a Research needing parts wakes parts.
      const withMakers: Mountain = {
        ...full,
        makers: {
          ...full.makers,
          glassworks: 1,
          partsPress: 1,
          precisionAssembly: 1,
        },
      };
      const withResearch = startResearch(withMakers, "opticalGauges");
      expect(deadStockpiles(withResearch)).toEqual([]);
    });
  });

  it("prices non-stone makers by the sum of all price lines in sticker and valueOf", () => {
    slice2Part2(() => {
      const m = part2Mountain();
      const ctx = {
        rates: effectiveRates(m),
        liveSeconds: 0,
        awaySeconds: 0,
      };
      for (const id of [
        "saw",
        "glassworks",
        "partsPress",
        "precisionAssembly",
      ] as const) {
        const expected = makerPrice(m, id).reduce(
          (sum, line) => sum + line.amount,
          0,
        );
        expect(expected).toBeGreaterThan(0);
        const action = { kind: "buyMaker", id } as const;
        expect(sticker(m, action)).toBe(expected);
        expect(valueOf(m, action, 3600, ctx).cost).toBe(expected);
      }
    });
  });
});

describe("multi-input Glassworks & steady-flow Factory (#771)", () => {
  it("gates Glassworks, Parts Press, Precision Assembly, and Factory helpers cleanly", () => {
    const m = part2Mountain();
    slice2Part1(() => {
      expect(factoryOpen(m)).toBe(false);
      expect(factoryMakers(m)).toEqual([]);
      expect(makerOpen(m, "glassworks")).toBe(false);
      expect(makerOpen(m, "partsPress")).toBe(false);
      expect(makerOpen(m, "precisionAssembly")).toBe(false);
      expect(jobOpen(m, "glassworks")).toBe(false);
      expect(jobOpen(m, "partsPress")).toBe(false);
      expect(jobOpen(m, "precisionAssembly")).toBe(false);
      expect(refineryMakers(m)).toEqual(["kiln", "saw"]);
    });

    slice2Part2(() => {
      expect(factoryOpen(m)).toBe(true);
      expect(factoryMakers(m)).toEqual(["partsPress", "precisionAssembly"]);
      expect(refineryMakers(m)).toEqual(["kiln", "saw", "glassworks"]);
      expect(makerOpen(m, "glassworks")).toBe(true);
      expect(makerOpen(m, "partsPress")).toBe(true);
      expect(makerOpen(m, "precisionAssembly")).toBe(true);
      expect(jobOpen(m, "glassworks")).toBe(true);
      expect(jobOpen(m, "partsPress")).toBe(true);
      expect(jobOpen(m, "precisionAssembly")).toBe(true);
      expect(hasOwnedFactoryLine(m)).toBe(false);
      expect(factoryOutputRoom(m)).toBe(0);
      expect(factoryInputOpen(m, "brick")).toBe(false);

      // Without Crystal Caves sunk, Parts Press opens with Foundry while
      // Glassworks and Precision Assembly wait for Crystal Caves.
      const beforeCrystal: Mountain = {
        ...m,
        mineLevels: m.mineLevels.granite
          ? { granite: m.mineLevels.granite }
          : {},
      };
      expect(makerOpen(beforeCrystal, "partsPress")).toBe(true);
      expect(makerOpen(beforeCrystal, "glassworks")).toBe(false);
      expect(makerOpen(beforeCrystal, "precisionAssembly")).toBe(false);
      expect(factoryMakers(beforeCrystal)).toEqual(["partsPress"]);
    });
  });

  it("enforces multi-worker staffing and multi-input consumption for Glassworks and Factory lines", () => {
    slice2Part2(() => {
      let m = part2Mountain();
      expect(makerWorkersPerUnit("kiln")).toBe(1);
      expect(makerWorkersPerUnit("glassworks")).toBe(2);
      expect(makerWorkersPerUnit("partsPress")).toBe(2);
      expect(makerWorkersPerUnit("precisionAssembly")).toBe(3);

      m = buyMaker(m, "glassworks");
      m = buyMaker(m, "partsPress");
      m = buyMaker(m, "precisionAssembly");
      expect(m.makers.glassworks).toBe(1);
      expect(m.makers.partsPress).toBe(1);
      expect(m.makers.precisionAssembly).toBe(1);
      expect(hasOwnedFactoryLine(m)).toBe(true);
      expect(factoryOutputRoom(m)).toBeGreaterThanOrEqual(300);
      expect(factoryInputOpen(m, "brick")).toBe(true);
      expect(factoryInputOpen(m, "cutStone")).toBe(true);
      expect(factoryInputOpen(m, "glass")).toBe(true);

      // Staffing fewer than workersPerUnit runs 0 units.
      m = placeWorker(m, "glassworks", 1);
      expect(runningMakers(m, "glassworks")).toBe(0);
      m = placeWorker(m, "glassworks", 1);
      expect(runningMakers(m, "glassworks")).toBe(1);
      expect(makerRate(m, "glassworks")).toBeCloseTo(
        makerMakes("glassworks"),
        8,
      );

      // Precision Assembly needs 3 workers per unit.
      m = placeWorker(m, "precisionAssembly", 2);
      expect(runningMakers(m, "precisionAssembly")).toBe(0);
      m = placeWorker(m, "precisionAssembly", 1);
      expect(runningMakers(m, "precisionAssembly")).toBe(1);

      // Glassworks stands idle if either crystalRock or stones is short.
      const stalled = stepMakerCycle({
        inputs: [
          { id: "crystalRock", amount: 3, held: 100 },
          { id: "stones", amount: 2, held: 1 },
        ],
        outputAmount: 1,
        outputRoom: 100,
        staffedOutputRate: makerRate(m, "glassworks"),
        dt: 10,
        cycleMicros: 0,
      });
      expect(stalled.produced).toBe(0);
      expect(stalled.nextMicros).toBe(0);
      expect(stalled.standing).toBe(true);

      // With both inputs present, Glassworks consumes 3 crystalRock + 2 stones -> 1 glass.
      const stepped = stepMakerCycle({
        inputs: [
          { id: "crystalRock", amount: 3, held: 30 },
          { id: "stones", amount: 2, held: 20 },
        ],
        outputAmount: 1,
        outputRoom: 100,
        staffedOutputRate: makerRate(m, "glassworks"),
        dt: 10,
        cycleMicros: 0,
      });
      expect(stepped.produced).toBeGreaterThan(0);
      expect(stepped.consumed.crystalRock).toBe(stepped.produced * 3);
      expect(stepped.consumed.stones).toBe(stepped.produced * 2);

      // Precision Assembly outputs 3 parts per cycle (2 brick + 2 cutStone + 2 glass -> 3 parts),
      // at 36 parts/s per running unit, and tracks fractional sub-cycle progress cleanly in
      // cycleMicros on slow lines (e.g. 0.3 parts/s -> 0.1 cycles/s).
      const precRate = makerRate(m, "precisionAssembly");
      expect(precRate).toBeCloseTo(36, 8);
      const fullOneSec = stepMakerCycle({
        inputs: [
          { id: "brick", amount: 2, held: 100 },
          { id: "cutStone", amount: 2, held: 100 },
          { id: "glass", amount: 2, held: 100 },
        ],
        outputAmount: 3,
        outputRoom: 100,
        staffedOutputRate: precRate,
        dt: 1,
        cycleMicros: 0,
      });
      expect(fullOneSec.produced).toBe(36);
      expect(fullOneSec.consumed).toEqual({
        brick: 24,
        cutStone: 24,
        glass: 24,
      });

      const slowOneSec = stepMakerCycle({
        inputs: [
          { id: "brick", amount: 2, held: 100 },
          { id: "cutStone", amount: 2, held: 100 },
          { id: "glass", amount: 2, held: 100 },
        ],
        outputAmount: 3,
        outputRoom: 100,
        staffedOutputRate: 0.3,
        dt: 1,
        cycleMicros: 0,
      });
      expect(slowOneSec.produced).toBe(0);
      expect(slowOneSec.nextMicros).toBe(100_000);
      const slowTenSec = stepMakerCycle({
        inputs: [
          { id: "brick", amount: 2, held: 100 },
          { id: "cutStone", amount: 2, held: 100 },
          { id: "glass", amount: 2, held: 100 },
        ],
        outputAmount: 3,
        outputRoom: 100,
        staffedOutputRate: 0.3,
        dt: 10,
        cycleMicros: 0,
      });
      expect(slowTenSec.produced).toBe(3);
      expect(slowTenSec.consumed).toEqual({ brick: 2, cutStone: 2, glass: 2 });
    });
  });

  it("distributes shared Factory inputs lowest-fill-fraction first, splitting ties evenly", () => {
    slice2Part2(() => {
      let m = part2Mountain();
      m = buyMaker(m, "partsPress");
      m = buyMaker(m, "precisionAssembly");
      expect(m.makers.partsPress).toBe(1);
      expect(m.makers.precisionAssembly).toBe(1);

      const roomPress = makerInputRoom(m, "partsPress", "brick");
      const roomPrec = makerInputRoom(m, "precisionAssembly", "brick");
      expect(factoryInputRoomTotal(m, "brick")).toBe(roomPress + roomPrec);

      // Empty tie -> splits evenly (50/50) and respects tieOffset on odd units.
      expect(distributeFactoryInput(m, "brick", 10, 0)).toEqual({
        partsPress: 5,
        precisionAssembly: 5,
      });
      expect(distributeFactoryInput(m, "brick", 1, 0)).toEqual({
        partsPress: 1,
      });
      expect(distributeFactoryInput(m, "brick", 1, 1)).toEqual({
        precisionAssembly: 1,
      });

      // Lower fill fraction catches up first before splitting remaining units.
      const uneven: Mountain = {
        ...m,
        makerBuffers: {
          ...m.makerBuffers,
          partsPress: { brick: 100 },
          precisionAssembly: { brick: 0 },
        },
      };
      // Catch-up for precisionAssembly is floor(100 * roomPrec / roomPress), leaving 50 to split 25/25.
      const catchUp = Math.floor((100 * roomPrec) / roomPress);
      expect(distributeFactoryInput(uneven, "brick", catchUp + 50, 0)).toEqual({
        partsPress: 25,
        precisionAssembly: catchUp + 25,
      });

      // Single-line input (glass -> precisionAssembly only) and zero amount.
      expect(distributeFactoryInput(m, "glass", 40, 0)).toEqual({
        precisionAssembly: 40,
      });
      expect(distributeFactoryInput(m, "brick", 0, 0)).toEqual({});
    });
  });
});

describe("Building 4 (Research Lab) and Research rules (#771)", () => {
  it("gates Building 4 behind slice2Part2On() and builds through 3 steps into operational", () => {
    const m = part2Mountain();
    slice2Part1(() => {
      expect(nextBuilding(m)).toBeUndefined();
      expect(researchOpen(m)).toBe(false);
    });
    slice2Part2(() => {
      const next = nextBuilding(m);
      expect(next?.id).toBe("researchLab");
      const ordered = placeOrder(m);
      expect(ordered.project.kind).toBe("delivering");
      if (ordered.project.kind === "delivering") {
        expect(ordered.project.site.building).toBe("researchLab");
        expect(ordered.project.site.step).toBe(0);
      }
      // Run enough time with Transport + Builders to finish all 3 steps of Building 4.
      const staffed: Mountain = {
        ...ordered,
        stock: {
          ...ordered.stock,
          brick: 300_000_000,
          cutStone: 200_000_000,
          parts: 15_000_000,
        },
        owned: { ...ordered.owned, helper: ordered.owned.helper + 1_000 },
        fleet: { horseWagon: 0, truck: 500 },
        jobs: { ...ordered.jobs, driving: 500, building: 500 },
      };
      const finished = accrueSlice2Stretches(staffed, 0, 24 * HOUR, 1).mountain;
      expect(finished.operational).toContain("researchLab");
      expect(researchOpen(finished)).toBe(true);
    });
  });

  it("supports free start, Transport delivery, lossless cancel past cap, manual install, and never auto-installs away", () => {
    slice2Part2(() => {
      const base: Mountain = {
        ...part2Mountain(),
        operational: ["lightTower", "warehouse", "foundry", "researchLab"],
        owned: { ...part2Mountain().owned, helper: 300 },
        fleet: { horseWagon: 0, truck: 200 },
        jobs: { ...part2Mountain().jobs, driving: 200 },
      };
      expect(RESEARCH_PROJECTS.length).toBe(8);
      expect(RESEARCH_IDS.length).toBe(8);

      // Start is free up front and works even with 0 stock (skips priceFits).
      const broke: Mountain = { ...base, stock: { ...EMPTY_STOCK } };
      const startedBroke = startResearch(broke, "ironRails");
      expect(startedBroke.research.active?.id).toBe("ironRails");
      expect(startedBroke.stock).toEqual(EMPTY_STOCK);

      // Transport delivers goods to the active project via stockToResearch:*.
      const started = startResearch(base, "ironRails");
      const delivered = accrueSlice2Live(
        started,
        0,
        1_200 * SECOND,
        1,
      ).mountain;
      const active = delivered.research.active;
      expect(active).toBeDefined();
      if (active === undefined) {
        return;
      }
      expect(researchReady(active)).toBe(true);
      // Even after full delivery over time away, Research NEVER auto-installs.
      const afterAway = accrueAway({
        mountain: delivered,
        lastSeen: 0,
        now: 2 * HOUR,
      }).mountain;
      expect(afterAway.research.active?.id).toBe("ironRails");
      expect(afterAway.research.done).not.toContain("ironRails");

      // Cancel refunds 100% of arrived goods even past stockyard cap and clears assignedRuns.
      const cap = stockpileRoom(delivered, "brick");
      const atCap: Mountain = {
        ...delivered,
        stock: { ...delivered.stock, brick: cap },
        assignedRuns: {
          "stockToResearch:brick": 2,
          "stockToResearch:cutStone": 1,
          pitTopsoilToKilns: 1,
        },
      };
      const canceled = cancelResearch(atCap);
      expect(canceled.research.active).toBeUndefined();
      expect(canceled.stock.brick).toBe(
        cap + priceAmount(researchPrice("ironRails"), "brick"),
      );
      expect(canceled.assignedRuns["stockToResearch:brick"]).toBeUndefined();
      expect(canceled.assignedRuns["stockToResearch:cutStone"]).toBeUndefined();
      expect(canceled.assignedRuns.pitTopsoilToKilns).toBe(1);

      // Manual install moves active -> done and activates the permanent bonus.
      const installed = installResearch(delivered);
      expect(installed.research.active).toBeUndefined();
      expect(installed.research.done).toContain("ironRails");
      expect(researchDone(installed, "ironRails")).toBe(true);
      expect(ironRailsMultiplier(installed)).toBeCloseTo(1.35, 8);
      expect(ironRailsMultiplier(base)).toBe(1);
    });
  });

  it("honors Part 1 instant upgrades without double-stacking and applies all four new Research bonuses", () => {
    slice2Part2(() => {
      const base: Mountain = {
        ...part2Mountain(),
        operational: ["lightTower", "warehouse", "foundry", "researchLab"],
        owned: {
          ...part2Mountain().owned,
          helper: 30,
          cart: 5,
          drill: 3,
          borer: 2,
        },
        jobs: { ...part2Mountain().jobs, drilling: 10 },
      };

      // Part 1 instant buyUpgrade is disabled under slice2Part2On().
      expect(buyUpgrade(base, "boots")).toBe(base);

      // Legacy Part 1 upgrade `boots: 1` counts as `workBoots` done (cannot be started again).
      const withLegacyBoots: Mountain = {
        ...base,
        upgrades: { ...base.upgrades, boots: 1 },
      };
      expect(researchDone(withLegacyBoots, "workBoots")).toBe(true);
      expect(researchAvailable(withLegacyBoots, "workBoots")).toBe(false);

      // Research `workBoots` alone produces the exact same rate as legacy `boots: 1`
      // (`1 + BOOTS_SPEED_PER_LEVEL = 1.36`) and never double-stacks when both are set.
      const withResearchedBoots: Mountain = {
        ...base,
        research: { done: ["workBoots"] },
      };
      const withBoth: Mountain = {
        ...withLegacyBoots,
        research: { done: ["workBoots"] },
      };
      const baseRate = effectiveRates(base).tierSpeed.helper;
      const expectedBoots = baseRate * (1 + BOOTS_SPEED_PER_LEVEL);
      expect(effectiveRates(withLegacyBoots).tierSpeed.helper).toBeCloseTo(
        expectedBoots,
        8,
      );
      expect(effectiveRates(withResearchedBoots).tierSpeed.helper).toBeCloseTo(
        expectedBoots,
        8,
      );
      expect(effectiveRates(withBoth).tierSpeed.helper).toBeCloseTo(
        expectedBoots,
        8,
      );

      // Synergy research projects (`loadingCrews`, `haulRoads`, `drillCrews`) match Part 1 upgrades.
      const withSynergies: Mountain = {
        ...base,
        research: { done: ["loadingCrews", "haulRoads", "drillCrews"] },
      };
      const withLegacySynergies: Mountain = {
        ...base,
        upgrades: { ...base.upgrades, cartSyn: 1, drillSyn: 1, borerSyn: 1 },
      };
      expect(effectiveRates(withSynergies).tierSpeed.helper).toBeCloseTo(
        effectiveRates(withLegacySynergies).tierSpeed.helper,
        8,
      );
      expect(effectiveRates(withSynergies).tierSpeed.cart).toBeCloseTo(
        effectiveRates(withLegacySynergies).tierSpeed.cart,
        8,
      );
      expect(effectiveRates(withSynergies).tierSpeed.drill).toBeCloseTo(
        effectiveRates(withLegacySynergies).tierSpeed.drill,
        8,
      );

      // ironRails boosts cart & train speed by +35% and leaves drill untouched.
      const withRails: Mountain = {
        ...base,
        research: { done: ["ironRails"] },
      };
      expect(effectiveRates(withRails).tierSpeed.cart).toBeCloseTo(
        effectiveRates(base).tierSpeed.cart * 1.35,
        8,
      );
      expect(effectiveRates(withRails).tierSpeed.train).toBeCloseTo(
        effectiveRates(base).tierSpeed.train * 1.35,
        8,
      );
      expect(effectiveRates(withRails).tierSpeed.drill).toBeCloseTo(
        effectiveRates(base).tierSpeed.drill,
        8,
      );

      // New Slice 2 Research bonuses: highDraftKilns (+35% kiln/saw), opticalGauges (+40% glass/factory),
      // heavyCouplings (+40% fleetRate).
      const boosted: Mountain = {
        ...base,
        research: {
          done: [
            "ironRails",
            "highDraftKilns",
            "opticalGauges",
            "heavyCouplings",
          ],
        },
      };
      expect(makerResearchMultiplier(boosted, "kiln")).toBeCloseTo(1.35, 8);
      expect(makerResearchMultiplier(boosted, "saw")).toBeCloseTo(1.35, 8);
      expect(makerResearchMultiplier(boosted, "glassworks")).toBeCloseTo(
        1.4,
        8,
      );
      expect(makerResearchMultiplier(boosted, "partsPress")).toBeCloseTo(
        1.4,
        8,
      );
      expect(makerResearchMultiplier(boosted, "precisionAssembly")).toBeCloseTo(
        1.4,
        8,
      );
      expect(transportResearchMultiplier(boosted)).toBeCloseTo(1.4, 8);
      expect(fleetRate(boosted)).toBeCloseTo(fleetRate(base) * 1.4, 8);
    });
  });
});

describe("actions, field-log, save-format, and save-merge for Part 2 (#771)", () => {
  it("lists, applies, values, and logs Research actions and suppresses upgradeActions in Part 2", () => {
    slice2Part2(() => {
      const m: Mountain = {
        ...part2Mountain(),
        operational: ["lightTower", "warehouse", "foundry", "researchLab"],
        owned: { ...part2Mountain().owned, helper: 300 },
        fleet: { horseWagon: 0, truck: 200 },
        jobs: { ...part2Mountain().jobs, driving: 200 },
      };
      const actions = listActions(m, 0);
      expect(actions.some((a) => a.kind === "buyUpgrade")).toBe(false);
      expect(actions.some((a) => a.kind === "startResearch")).toBe(true);

      const ctx = { liveSeconds: 600, awaySeconds: 3600 };
      expect(
        valueOf(m, { kind: "startResearch", id: "ironRails" }, 0, ctx).cost,
      ).toBe(0);

      const startMove = applyMove(
        m,
        { kind: "startResearch", id: "ironRails" },
        0,
      );
      expect(startMove.kind).toBe("applied");
      if (startMove.kind !== "applied") {
        return;
      }
      expect(startMove.events).toEqual([
        { kind: "researchStarted", id: "ironRails" },
      ]);
      const [startEvent] = startMove.events;
      expect(startEvent !== undefined ? fieldEntry(startEvent).code : "").toBe(
        "research.start",
      );

      // While delivering, only cancelResearch is listed.
      const deliveringActions = listActions(startMove.mountain, 0);
      expect(
        deliveringActions.filter((a) => a.kind === "cancelResearch"),
      ).toHaveLength(1);
      expect(
        deliveringActions.filter((a) => a.kind === "installResearch"),
      ).toHaveLength(0);
      expect(
        valueOf(startMove.mountain, { kind: "cancelResearch" }, 0, ctx).cost,
      ).toBe(0);

      const cancelMove = applyMove(
        startMove.mountain,
        { kind: "cancelResearch" },
        0,
      );
      expect(cancelMove.kind).toBe("applied");
      if (cancelMove.kind !== "applied") {
        return;
      }
      expect(cancelMove.events).toEqual([
        { kind: "researchCanceled", id: "ironRails" },
      ]);
      const [cancelEvent] = cancelMove.events;
      expect(
        cancelEvent !== undefined ? fieldEntry(cancelEvent).code : "",
      ).toBe("research.cancel");

      // Restart, deliver fully, then install.
      const restarted = startResearch(m, "ironRails");
      const ready = accrueSlice2Live(restarted, 0, 1_200 * SECOND, 1).mountain;
      const readyActions = listActions(ready, 0);
      expect(
        readyActions.filter((a) => a.kind === "installResearch"),
      ).toHaveLength(1);
      expect(valueOf(ready, { kind: "installResearch" }, 0, ctx).cost).toBe(0);

      const installMove = applyMove(ready, { kind: "installResearch" }, 0);
      expect(installMove.kind).toBe("applied");
      if (installMove.kind !== "applied") {
        return;
      }
      expect(installMove.events).toEqual([
        { kind: "researchInstalled", id: "ironRails" },
      ]);
      const [installEvent] = installMove.events;
      expect(
        installEvent !== undefined ? fieldEntry(installEvent).code : "",
      ).toBe("research.install");
    });
  });

  it("round-trips factoryOutput and research in save-format and validates every bad/newer branch", () => {
    slice2Part2(() => {
      const m = part2Mountain();
      const activePrice = researchPrice("opticalGauges");
      const rich: Mountain = {
        ...m,
        operational: [...m.operational, "researchLab"],
        makers: {
          ...m.makers,
          glassworks: 1,
          partsPress: 2,
          precisionAssembly: 1,
        },
        makerBuffers: {
          ...m.makerBuffers,
          glassworks: { crystalRock: 12, stones: 8 },
          partsPress: { brick: 10, cutStone: 10 },
          precisionAssembly: { brick: 6, cutStone: 6, glass: 6 },
        },
        cycleMicros: {
          glassworks: 500_000,
          precisionAssembly: 250_000,
        },
        factoryOutput: { parts: 42 },
        research: {
          done: ["ironRails"],
          active: {
            id: "opticalGauges",
            arrived: {
              ...EMPTY_STOCK,
              glass: Math.min(10, priceAmount(activePrice, "glass")),
            },
          },
        },
      };
      const saved = writeGame(rich);
      const loaded = readGame(saved, 0);
      expect(loaded.kind).toBe("ok");
      if (loaded.kind === "ok") {
        expect(loaded.mountain.factoryOutput).toEqual({ parts: 42 });
        expect(loaded.mountain.research).toEqual(rich.research);
        expect(loaded.mountain.makerBuffers.glassworks).toEqual({
          crystalRock: 12,
          stones: 8,
        });
      }

      // Done-only research (no active) round-trips cleanly.
      const doneOnly = writeGame({
        ...rich,
        research: { done: ["ironRails"] },
      });
      const loadedDone = readGame(doneOnly, 0);
      expect(loadedDone.kind).toBe("ok");
      if (loadedDone.kind === "ok") {
        expect(loadedDone.mountain.research).toEqual({ done: ["ironRails"] });
      }

      // Active Part-1-equivalent Research project with legacy upgrade at 0 loads cleanly.
      const withWorkBoots = readGame(
        {
          ...saved,
          research: { done: [], active: { id: "workBoots", arrived: {} } },
        },
        0,
      );
      expect(withWorkBoots.kind).toBe("ok");
      expect(sticker(m, { kind: "startResearch", id: "ironRails" })).toBe(0);
      expect(sticker(m, { kind: "cancelResearch" })).toBe(0);
      expect(sticker(m, { kind: "installResearch" })).toBe(0);

      // factoryOutput bad & newer branches
      expect(readGame({ ...saved, factoryOutput: "bad" }, 0).kind).toBe("bad");
      expect(readGame({ ...saved, factoryOutput: { parts: -1 } }, 0).kind).toBe(
        "bad",
      );
      expect(
        readGame({ ...saved, factoryOutput: { parts: 1, widgets: 2 } }, 0).kind,
      ).toBe("newer");

      // research bad & newer branches
      expect(readGame({ ...saved, research: "bad" }, 0).kind).toBe("bad");
      expect(readGame({ ...saved, research: { done: [123] } }, 0).kind).toBe(
        "bad",
      );
      expect(
        readGame({ ...saved, research: { done: ["futureProject"] } }, 0).kind,
      ).toBe("newer");
      expect(
        readGame({ ...saved, research: { done: [], extra: 1 } }, 0).kind,
      ).toBe("newer");
      expect(readGame({ ...saved, research: { active: "bad" } }, 0).kind).toBe(
        "bad",
      );
      expect(
        readGame({ ...saved, research: { active: { id: 42 } } }, 0).kind,
      ).toBe("bad");
      expect(
        readGame(
          {
            ...saved,
            research: { active: { id: "ironRails", arrived: "bad" } },
          },
          0,
        ).kind,
      ).toBe("bad");
      expect(
        readGame(
          {
            ...saved,
            research: {
              active: { id: "ironRails", arrived: { unobtanium: 5 } },
            },
          },
          0,
        ).kind,
      ).toBe("newer");
      expect(
        readGame({ ...saved, research: { active: { id: "futureProject" } } }, 0)
          .kind,
      ).toBe("newer");
      expect(
        readGame(
          {
            ...saved,
            research: { active: { id: "ironRails", extra: 1 } },
          },
          0,
        ).kind,
      ).toBe("newer");
      // Arrived past research price is bad.
      expect(
        readGame(
          {
            ...saved,
            research: {
              active: { id: "ironRails", arrived: { stones: 999_999_999 } },
            },
          },
          0,
        ).kind,
      ).toBe("bad");
      // Active project already in done is bad.
      expect(
        readGame(
          {
            ...saved,
            research: {
              done: ["ironRails"],
              active: { id: "ironRails", arrived: {} },
            },
          },
          0,
        ).kind,
      ).toBe("bad");
      // Active project already owned via Part 1 legacy upgrade is bad.
      expect(
        readGame(
          {
            ...saved,
            levels: { boots: 1 },
            research: {
              done: [],
              active: { id: "workBoots", arrived: {} },
            },
          },
          0,
        ).kind,
      ).toBe("bad");
      // Bad facts alongside valid research propagates facts error cleanly.
      expect(
        readGame(
          {
            ...saved,
            owned: "bad",
            research: { done: ["ironRails"] },
          },
          0,
        ).kind,
      ).toBe("bad");

      // Unsunk Crystal Caves rejects glassworks/precisionAssembly makers, buffers, and cycleMicros.
      const withoutCrystal = {
        ...saved,
        mineLevels: { granite: saved.mineLevels?.granite },
      };
      expect(readGame(withoutCrystal, 0).kind).toBe("bad");
      expect(
        readGame(
          {
            mineLevels: { granite: {} },
            makerBuffers: { glassworks: { crystalRock: 5 } },
          },
          0,
        ).kind,
      ).toBe("bad");
      expect(
        readGame(
          {
            mineLevels: { granite: {} },
            cycleMicros: { precisionAssembly: 100 },
          },
          0,
        ).kind,
      ).toBe("bad");
    });
  });

  it("tracks research.done monotonically in mergeSaves", () => {
    const base = createMountain();
    const withIron: Mountain = { ...base, research: { done: ["ironRails"] } };
    const withKilns: Mountain = {
      ...base,
      research: { done: ["highDraftKilns"] },
    };
    const mBase = { mountain: base, lastSeen: 1000, rev: 1 };
    const mIron = { mountain: withIron, lastSeen: 2000, rev: 2 };
    const mKilns = { mountain: withKilns, lastSeen: 2000, rev: 2 };
    expect(mergeSaves(mBase, mIron).kind).toBe("fast-forward");
    expect(mergeSaves(mIron, mBase).kind).toBe("fast-forward");
    expect(mergeSaves(mIron, mKilns).kind).toBe("conflict");
  });
});

describe("8-hour live vs. offline parity across Part 2 chains (#771)", () => {
  function assertWithinPercent(
    a: number,
    b: number,
    maxPct: number,
    label: string,
  ): void {
    const denom = Math.max(1, Math.abs(a), Math.abs(b));
    const pct = (Math.abs(a - b) / denom) * 100;
    expect(
      pct,
      `${label}: live=${String(a)}, away=${String(b)}, diff=${pct.toFixed(3)}%`,
    ).toBeLessThanOrEqual(maxPct);
  }

  it("matches within 1% over 8 hours on a full 3-level + Glassworks + Factory + Research chain", () => {
    slice2Part2(() => {
      let m = part2Mountain();
      m = {
        ...m,
        operational: ["lightTower", "warehouse", "foundry", "researchLab"],
        owned: {
          ...m.owned,
          helper: 200,
          cart: 12,
          drill: 8,
          borer: 3,
          hoist: 8,
          machine: 2,
        },
        mineLevels: {
          granite: {
            machines: { cart: 4, drill: 3, borer: 1, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
          crystal: {
            machines: { cart: 3, drill: 2, borer: 1, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        cages: {
          assigned: { topsoil: 2, granite: 3, crystal: 3 },
          trips: {},
        },
        makers: {
          kiln: 3,
          saw: 2,
          glassworks: 2,
          partsPress: 2,
          precisionAssembly: 1,
        },
        fleet: { horseWagon: 10, truck: 80 },
        jobs: {
          drilling: 20,
          haulage: 20,
          graniteDrilling: 6,
          graniteHaulage: 6,
          crystalDrilling: 6,
          crystalHaulage: 6,
          hoisting: 8,
          kilns: 3,
          saws: 2,
          glassworks: 4,
          partsPress: 4,
          precisionAssembly: 3,
          driving: 90,
          building: 0,
        },
        stock: {
          stones: 20_000,
          brick: 10_000,
          cutStone: 5_000,
          glass: 1_000,
          parts: 0,
        },
        pithead: { topsoil: 200, granite: 200, crystal: 200 },
        makerBuffers: {
          kiln: { topsoilRock: 100 },
          saw: { graniteRock: 100 },
          glassworks: { crystalRock: 100, stones: 100 },
          partsPress: { brick: 100, cutStone: 100 },
          precisionAssembly: { brick: 100, cutStone: 100, glass: 100 },
        },
        factoryOutput: { parts: 0 },
      };
      m = startResearch(m, "heavyCouplings");

      // Verify RUN_ORDER contains all 19 runs and snapshots see open Part 2 runs.
      expect(RUN_ORDER.length).toBe(19);
      const snaps = runSnapshots(m);
      expect(
        snaps.some((s) => s.id === "pitCrystalToGlassworks" && s.open),
      ).toBe(true);
      expect(
        snaps.some((s) => s.id === "factoryToStockyardParts" && s.open),
      ).toBe(true);
      expect(
        snaps.some((s) => s.id === "stockToResearch:parts" && s.open),
      ).toBe(true);
      expect(
        planTransportTransfer(m, 1).moved.pitCrystalToGlassworks,
      ).toBeGreaterThanOrEqual(0);

      const HOURS = 8;
      // Live: 1-second ticks at pay = 1 for 8 hours vs stretch solver at pay = 1 for 8 hours.
      const live = accrue({
        mountain: m,
        from: 0,
        to: HOURS * HOUR,
        pay: 1,
        live: true,
      }).mountain;
      const away = accrue({
        mountain: m,
        from: 0,
        to: HOURS * HOUR,
        pay: 1,
        live: false,
      }).mountain;

      // Significant real Part 2 production happened (glass went to precisionAssembly + Research).
      const liveGlassTotal =
        live.stock.glass + (live.research.active?.arrived.glass ?? 0);
      const awayGlassTotal =
        away.stock.glass + (away.research.active?.arrived.glass ?? 0);
      const livePartsTotal =
        live.stock.parts +
        live.factoryOutput.parts +
        (live.research.active?.arrived.parts ?? 0);
      const awayPartsTotal =
        away.stock.parts +
        away.factoryOutput.parts +
        (away.research.active?.arrived.parts ?? 0);
      expect(liveGlassTotal).toBeGreaterThan(1_000);
      expect(livePartsTotal).toBeGreaterThan(1_000);

      assertWithinPercent(live.stock.stones, away.stock.stones, 1, "stones");
      assertWithinPercent(live.stock.brick, away.stock.brick, 1, "brick");
      assertWithinPercent(
        live.stock.cutStone,
        away.stock.cutStone,
        1,
        "cutStone",
      );
      assertWithinPercent(liveGlassTotal, awayGlassTotal, 1, "glass total");
      assertWithinPercent(livePartsTotal, awayPartsTotal, 1, "parts total");
      assertWithinPercent(
        live.research.active?.arrived.parts ?? 0,
        away.research.active?.arrived.parts ?? 0,
        1,
        "research.arrived.parts",
      );
      assertWithinPercent(
        live.research.active?.arrived.glass ?? 0,
        away.research.active?.arrived.glass ?? 0,
        1,
        "research.arrived.glass",
      );
    });
  }, 30_000);

  it("matches within 1% over 8 hours with scarce shared Factory input (brick starved) and slow line", () => {
    slice2Part2(() => {
      const m: Mountain = {
        ...part2Mountain(),
        owned: {
          ...part2Mountain().owned,
          helper: 80,
          cart: 4,
          drill: 2,
          hoist: 4,
        },
        mineLevels: {
          granite: {
            machines: { cart: 2, drill: 1, borer: 0, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
          crystal: {
            machines: { cart: 2, drill: 1, borer: 0, train: 0 },
            piles: { face: 0, shaft: 0, saw: 0 },
          },
        },
        cages: {
          assigned: { topsoil: 1, granite: 1, crystal: 2 },
          trips: {},
        },
        // Only 1 kiln feeding brick to BOTH 2 Parts Presses and 1 Precision Assembly (scarce brick!).
        makers: {
          kiln: 1,
          saw: 2,
          glassworks: 2,
          partsPress: 2,
          precisionAssembly: 1,
        },
        fleet: { horseWagon: 10, truck: 6 },
        jobs: {
          drilling: 4,
          haulage: 4,
          graniteDrilling: 4,
          graniteHaulage: 4,
          crystalDrilling: 4,
          crystalHaulage: 4,
          hoisting: 6,
          kilns: 1,
          saws: 2,
          glassworks: 4,
          partsPress: 4,
          precisionAssembly: 3,
          driving: 16,
          building: 0,
        },
        stock: {
          stones: 50_000,
          brick: 50,
          cutStone: 50_000,
          glass: 20_000,
          parts: 0,
        },
        pithead: { topsoil: 50, granite: 50, crystal: 50 },
        makerBuffers: {
          kiln: { topsoilRock: 20 },
          saw: { graniteRock: 20 },
          glassworks: { crystalRock: 20, stones: 20 },
          partsPress: { brick: 0, cutStone: 200 },
          precisionAssembly: { brick: 0, cutStone: 200, glass: 200 },
        },
        factoryOutput: { parts: 0 },
      };

      const HOURS = 8;
      const live = accrue({
        mountain: m,
        from: 0,
        to: HOURS * HOUR,
        pay: 1,
        live: true,
      }).mountain;
      const away = accrue({
        mountain: m,
        from: 0,
        to: HOURS * HOUR,
        pay: 1,
        live: false,
      }).mountain;

      const liveParts = live.stock.parts + live.factoryOutput.parts;
      const awayParts = away.stock.parts + away.factoryOutput.parts;
      expect(liveParts).toBeGreaterThan(500);
      assertWithinPercent(liveParts, awayParts, 1, "scarce-brick total parts");
      assertWithinPercent(
        live.stock.glass,
        away.stock.glass,
        1,
        "scarce-brick glass",
      );
    });
  }, 30_000);

  it("matches within 1% when factoryOutput.parts is full and both Factory lines contend, without overflowing input buffers", () => {
    slice2Part2(() => {
      const m: Mountain = {
        ...part2Mountain(),
        operational: ["lightTower", "warehouse", "foundry", "researchLab"],
        owned: { ...part2Mountain().owned, helper: 80 },
        makers: {
          kiln: 0,
          saw: 0,
          glassworks: 0,
          partsPress: 2,
          precisionAssembly: 1,
        },
        fleet: { horseWagon: 6, truck: 0 },
        jobs: {
          drilling: 0,
          haulage: 0,
          graniteDrilling: 0,
          graniteHaulage: 0,
          crystalDrilling: 0,
          crystalHaulage: 0,
          hoisting: 0,
          kilns: 0,
          saws: 0,
          glassworks: 0,
          partsPress: 4,
          precisionAssembly: 3,
          driving: 6,
          building: 0,
        },
        stock: {
          stones: 0,
          brick: 1_000_000,
          cutStone: 1_000_000,
          glass: 1_000_000,
          parts: 200_000,
        },
        pithead: { topsoil: 0, granite: 0, crystal: 0 },
        makerBuffers: {
          kiln: {},
          saw: {},
          glassworks: {},
          partsPress: { brick: 1200, cutStone: 1200 },
          precisionAssembly: { brick: 1200, cutStone: 1200, glass: 1200 },
        },
        factoryOutput: { parts: 3000 },
      };
      const withRes = startResearch(m, "heavyCouplings");
      const live = accrue({
        mountain: withRes,
        from: 0,
        to: 8 * HOUR,
        pay: 1,
        live: true,
      }).mountain;
      const away = accrue({
        mountain: withRes,
        from: 0,
        to: 8 * HOUR,
        pay: 1,
        live: false,
      }).mountain;

      const livePartsMade =
        live.stock.parts +
        live.factoryOutput.parts +
        (live.research.active?.arrived.parts ?? 0) -
        (withRes.stock.parts + withRes.factoryOutput.parts);
      const awayPartsMade =
        away.stock.parts +
        away.factoryOutput.parts +
        (away.research.active?.arrived.parts ?? 0) -
        (withRes.stock.parts + withRes.factoryOutput.parts);
      const liveGlassSpent =
        withRes.stock.glass -
        live.stock.glass -
        (live.research.active?.arrived.glass ?? 0);
      const awayGlassSpent =
        withRes.stock.glass -
        away.stock.glass -
        (away.research.active?.arrived.glass ?? 0);
      expect(livePartsMade).toBeGreaterThan(10_000);
      assertWithinPercent(
        livePartsMade,
        awayPartsMade,
        1,
        "full-output partsMade",
      );
      assertWithinPercent(
        liveGlassSpent,
        awayGlassSpent,
        1,
        "full-output glassSpent",
      );
      // Individual Factory input buffers must never overshoot makerInputRoom.
      expect(
        away.makerBuffers.precisionAssembly.brick ?? 0,
      ).toBeLessThanOrEqual(makerInputRoom(away, "precisionAssembly", "brick"));
      expect(
        away.makerBuffers.precisionAssembly.cutStone ?? 0,
      ).toBeLessThanOrEqual(
        makerInputRoom(away, "precisionAssembly", "cutStone"),
      );
      expect(
        away.makerBuffers.precisionAssembly.glass ?? 0,
      ).toBeLessThanOrEqual(makerInputRoom(away, "precisionAssembly", "glass"));

      // Float-dust check: equal rooms (both 1440 at 3 partsPress vs 1 precisionAssembly) must still send 1 unit to the lower line (28 vs 29).
      const dust: Mountain = {
        ...m,
        makers: { ...m.makers, partsPress: 3, precisionAssembly: 1 },
        makerBuffers: {
          ...m.makerBuffers,
          partsPress: { brick: 28 },
          precisionAssembly: { brick: 29 },
        },
      };
      expect(distributeFactoryInput(dust, "brick", 1, 1)).toEqual({
        partsPress: 1,
      });
    });
  }, 30_000);
});

import { describe, expect, it } from "vitest";
import { SITE_GOOD_CAP } from "./building-site";
import { holdOrder, placeOrder } from "./city";
import { projectCard } from "./city-view";
import { formatCompact } from "./format";
import { levelsView } from "./mine-level-view";
import { pitheadRoom } from "./mine-piles";
import { pileWords, stageRows } from "./mine-view";
import { createMountain, type Mountain } from "./mountain";
import { nextView, siteCounts, siteOpen } from "./next-view";
import { levels, slice2Part1, slice2Part2 } from "./part-three.harness";
import { NO_LEVEL_MACHINES } from "./mine-levels";
import { makerInputRoom } from "./makers";
import { researchPrice, startResearch } from "./research";
import { shiftReport } from "./shift-report-view";
import { EMPTY_STOCK, priceAmount } from "./stock";
import { stockpileRoom } from "./stockyard";
import {
  TRANSPORT_RULE_PART_1,
  transportChip,
  transportSheetView,
} from "./transport-view";

describe("transport-view (#768)", () => {
  it("reports top strip chip counts, rates, and amber/green/dark lamp priority", () => {
    slice2Part1(() => {
      // Unstaffed vehicle -> amber even when affordable.
      const unstaffed: Mountain = {
        ...createMountain(),
        stock: { ...createMountain().stock, stones: 10_000 },
        fleet: { horseWagon: 2, truck: 0 },
        jobs: { ...createMountain().jobs, driving: 1 },
      };
      const amberChip = transportChip(unstaffed);
      expect(amberChip.count).toBe("1/2");
      expect(amberChip.rate).toBe("18/s");
      expect(amberChip.lamp).toBe("amber");

      // All vehicles staffed + affordable wagon -> green.
      const greenChip = transportChip({
        ...unstaffed,
        jobs: { ...unstaffed.jobs, driving: 2 },
      });
      expect(greenChip.count).toBe("2/2");
      expect(greenChip.rate).toBe("36/s");
      expect(greenChip.lamp).toBe("green");

      // All vehicles staffed + unaffordable -> dark.
      const darkChip = transportChip({
        ...unstaffed,
        stock: { ...unstaffed.stock, stones: 0 },
        jobs: { ...unstaffed.jobs, driving: 2 },
      });
      expect(darkChip.lamp).toBe("dark");
    });
  });

  it("shows open physical runs with live even-share rates, vehicle shares, and idle/full markers", () => {
    slice2Part1(() => {
      const m = placeOrder(
        levels({
          sunk: true,
          operational: ["lightTower", "warehouse"],
          topsoil: 4,
          granite: 4,
          hoisting: 4,
          driving: 2,
          building: 1,
          kilns: 1,
          saws: 1,
          pithead: { topsoil: 100, granite: 100 },
          stock: { stones: 1_000, brick: 1_000, cutStone: 1_000 },
        }),
      );
      const withTwoWagons: Mountain = {
        ...m,
        fleet: { horseWagon: 2, truck: 0 },
      };
      const view = transportSheetView(withTwoWagons, "one");
      expect(view.rule).toBe(TRANSPORT_RULE_PART_1);
      expect(view.totalRate).toBe("36/s");
      expect(view.keys.map((k) => k.id)).toEqual(["horseWagon", "truck"]);
      expect(view.runs.map((r) => r.id)).toEqual([
        "pitToStockyardStones",
        "pitTopsoilToKilns",
        "pitGraniteToSaws",
        "stockToCity:brick",
        "stockToCity:cutStone",
      ]);
      for (const run of view.runs) {
        expect(run.status).toBe("active");
        expect(run.rate).toBeGreaterThan(0);
        expect(run.shareText).not.toBe("0 veh");
      }

      // Hold pauses City runs while keeping pithead/maker runs active.
      const held = transportSheetView(holdOrder(withTwoWagons), "one");
      expect(
        held.runs.find((r) => r.id === "stockToCity:brick")?.statusText,
      ).toBe("on hold");
      expect(
        held.runs.find((r) => r.id === "pitToStockyardStones")?.status,
      ).toBe("active");

      // Full stockyard marks pitToStockyardStones dest full.
      const fullStone = transportSheetView(
        {
          ...withTwoWagons,
          stock: {
            ...withTwoWagons.stock,
            stones: stockpileRoom(withTwoWagons, "stones"),
          },
        },
        "one",
      );
      expect(
        fullStone.runs.find((r) => r.id === "pitToStockyardStones")?.statusText,
      ).toBe("dest full");

      // Zero drivers marks all open runs no driver.
      const noDrivers = transportSheetView(
        {
          ...withTwoWagons,
          jobs: { ...withTwoWagons.jobs, driving: 0 },
        },
        "one",
      );
      expect(noDrivers.runs.every((r) => r.statusText === "no driver")).toBe(
        true,
      );
    });
  });

  it("moves affordable vehicles from City to Transport in nextView and hides Factory tab in Part 1", () => {
    slice2Part1(() => {
      const m = levels({
        sunk: true,
        operational: ["lightTower", "warehouse"],
        stock: { stones: 10_000, brick: 200_000 },
      });
      expect(siteOpen(m, "factory")).toBe(false);
      expect(siteCounts(m).city).toBe(0);
      const next = nextView(placeOrder(m));
      expect(next.kind).toBe("affordable");
      if (next.kind === "affordable") {
        expect(next.counts.find((c) => c.where === "transport")?.count).toBe(2);
        expect(next.counts.find((c) => c.where === "city")).toBeUndefined();
      }
    });
  });

  it("shows hoist pithead-full stall visibility on single-level and two-level mines, per-good City on-site bars, and cutStone shift marks", () => {
    slice2Part1(() => {
      const singleBase = levels({
        sunk: false,
        topsoil: 2,
        hoisting: 2,
        driving: 0,
      });
      const singleRoom = pitheadRoom(singleBase);
      const single: Mountain = {
        ...singleBase,
        pithead: { topsoil: singleRoom, granite: 0, crystal: 0 },
      };
      const liftRow = stageRows(single).find((r) => r.stage === "lift");
      expect(liftRow?.pile?.full).toBe(true);
      expect(liftRow?.pile ? pileWords(liftRow.pile) : "").toContain("(full)");
      expect(liftRow?.now).toBe("0");

      const twoBase = levels({
        sunk: true,
        operational: ["lightTower"],
        topsoil: 2,
        granite: 2,
        hoisting: 2,
        driving: 0,
      });
      const twoRoom = pitheadRoom(twoBase);
      const two: Mountain = {
        ...twoBase,
        pithead: { topsoil: 10, granite: twoRoom, crystal: 0 },
      };
      const twoView = levelsView(two);
      expect(twoView).toBeDefined();
      const twoLift = twoView?.hoisting;
      expect(twoLift?.pile?.full).toBe(true);
      expect(twoLift?.pile ? pileWords(twoLift.pile) : "").toBe(
        `Granite pithead: ${formatCompact(twoRoom)} of ${formatCompact(twoRoom)} (full)`,
      );

      // Per-good on-site buffer readout in City projectCard.
      const cityM = placeOrder(
        levels({
          sunk: false,
          operational: ["lightTower"],
          topsoil: 2,
          hoisting: 2,
          driving: 1,
          building: 1,
        }),
      );
      const withOnSite: Mountain = {
        ...cityM,
        project: {
          kind: "delivering",
          site: {
            building: "warehouse",
            step: 0,
            arrived: { ...cityM.stock, stones: 250 },
            onSite: { ...cityM.stock, stones: 180 },
          },
        },
      };
      const card = projectCard(withOnSite);
      expect(card.kind).toBe("project");
      if (card.kind === "project") {
        expect(card.builders.line).toBe("1 builder ×50/s");
        expect(card.bars[0]?.onSite).toBe(
          `180/${String(SITE_GOOD_CAP)} on site`,
        );
      }

      // Shift report includes cutStone fullAtMs mark under Slice 2 Part 1.
      const cutStoneReport = {
        awayMs: 8 * 3_600_000,
        paidMs: 4 * 3_600_000,
        capped: false,
        mined: 0,
        materials: EMPTY_STOCK,
        night: {
          producedMs: 4 * 3_600_000,
          deadMs: 0,
          payFrom: 0.45,
          payTo: 0.45,
          produced: { ...EMPTY_STOCK, cutStone: 1000 },
          delivered: EMPTY_STOCK,
          steps: [],
          stop: "stockyard" as const,
          fullAtMs: { cutStone: 3 * 3_600_000 },
        },
      };
      expect(shiftReport(cutStoneReport).marks).toEqual([
        "Cut stone full at 3 h",
      ]);
    });
    // Off in Slice 1 play: cutStone mark stays hidden.
    expect(
      shiftReport({
        awayMs: 8 * 3_600_000,
        paidMs: 4 * 3_600_000,
        capped: false,
        mined: 0,
        night: {
          producedMs: 4 * 3_600_000,
          deadMs: 0,
          payFrom: 0.45,
          payTo: 0.45,
          produced: { ...EMPTY_STOCK, cutStone: 1000 },
          delivered: EMPTY_STOCK,
          steps: [],
          stop: "stockyard",
          fullAtMs: { cutStone: 3 * 3_600_000 },
        },
      }).marks,
    ).toEqual([]);
  });

  it("aligns multi-good City full-buffer caps, maker-buffer supply, per-good City brings, Both pitheads label, and Next stall with the solver", () => {
    slice2Part1(() => {
      // Both Warehouse Foundation buffers full at 500/500 with 1 builder (50/s) and 1 truck (400/s):
      // each stockToCity run gets half of buildRate (25/s each, 50/s total), not 50/s each.
      const base = placeOrder(
        levels({
          sunk: false,
          operational: ["lightTower"],
          topsoil: 0,
          hoisting: 0,
          driving: 1,
          building: 1,
          kilns: 1,
          stock: { stones: 5_000, brick: 5_000 },
        }),
      );
      const bothFull: Mountain = {
        ...base,
        fleet: { horseWagon: 0, truck: 1 },
        project: {
          kind: "delivering",
          site: {
            building: "warehouse",
            step: 0,
            arrived: { ...EMPTY_STOCK, stones: 500, brick: 500 },
            onSite: {
              ...EMPTY_STOCK,
              stones: SITE_GOOD_CAP,
              brick: SITE_GOOD_CAP,
            },
          },
        },
      };
      const fullView = transportSheetView(bothFull, "one");
      const sRun = fullView.runs.find((r) => r.id === "stockToCity:stones");
      const bRun = fullView.runs.find((r) => r.id === "stockToCity:brick");
      expect(sRun?.rate).toBe(25);
      expect(bRun?.rate).toBe(25);

      // 2-good project with 300/500 + 250/500 on site (total 550 >= legacy 500, neither full):
      // City orderKey brings rate uses full fleet carry (not clamped to 50/s buildRate).
      const partialTwo: Mountain = {
        ...bothFull,
        project: {
          kind: "delivering",
          site: {
            building: "warehouse",
            step: 0,
            arrived: { ...EMPTY_STOCK, stones: 300, brick: 250 },
            onSite: { ...EMPTY_STOCK, stones: 300, brick: 250 },
          },
        },
      };
      const card = projectCard(partialTwo);
      expect(card.kind).toBe("project");
      if (card.kind === "project") {
        expect(card.key.lines[0]).toBe("arriving 400/s");
      }

      // Maker buffer with empty stock & empty pithead still supplies stockToCity:brick.
      const makerSupply: Mountain = {
        ...base,
        fleet: { horseWagon: 0, truck: 1 },
        stock: { ...EMPTY_STOCK },
        makerBuffers: {
          ...base.makerBuffers,
          kiln: { topsoilRock: 200 },
        },
      };
      const makerView = transportSheetView(makerSupply, "one");
      const brickFromMaker = makerView.runs.find(
        (r) => r.id === "stockToCity:brick",
      );
      expect(brickFromMaker?.status).toBe("active");
      expect(brickFromMaker?.rate).toBeGreaterThan(0);
      expect(brickFromMaker?.shareText).toBe("<0.1 veh");

      // Both pitheads full renders compact "Both pitheads: ..." and Next reports "The line stands." when underground piles are also full.
      const twoBase = levels({
        sunk: true,
        operational: ["lightTower"],
        topsoil: 2,
        granite: 2,
        hoisting: 2,
        driving: 0,
      });
      const room = pitheadRoom(twoBase);
      const stalled: Mountain = {
        ...placeOrder(twoBase),
        stock: EMPTY_STOCK,
        piles: { face: 300, shaft: room, kiln: 0 },
        pithead: { topsoil: room, granite: room, crystal: 0 },
        mineLevels: {
          ...twoBase.mineLevels,
          ...(twoBase.mineLevels.granite === undefined
            ? {}
            : {
                granite: {
                  ...twoBase.mineLevels.granite,
                  piles: { face: 300, shaft: room, saw: 0 },
                },
              }),
        },
      };
      const twoLift = levelsView(stalled)?.hoisting;
      expect(twoLift?.pile ? pileWords(twoLift.pile) : "").toBe(
        `Both pitheads: ${formatCompact(room)} of ${formatCompact(room)} (full)`,
      );
      const next = nextView(stalled);
      expect(next.kind).toBe("nothing");
      if (next.kind === "nothing") {
        expect(next.then).toBe("The line stands.");
      }
    });
  });

  it("applies transportResearchMultiplier to fleetSummary and renders Factory + Research destInfo (#779)", () => {
    slice2Part2(() => {
      const base = levels({
        sunk: true,
        operational: ["lightTower", "warehouse", "foundry", "researchLab"],
        driving: 2,
        stock: {
          stones: 50_000,
          brick: 50_000,
          cutStone: 50_000,
          glass: 50_000,
          parts: 50_000,
        },
      });
      const m: Mountain = {
        ...base,
        fleet: { horseWagon: 1, truck: 1 },
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
        makerBuffers: {
          kiln: {},
          saw: {},
          glassworks: {},
          partsPress: { brick: 120, cutStone: 60 },
          precisionAssembly: { brick: 80, cutStone: 40, glass: 50 },
        },
      };
      const withResearch = startResearch(
        {
          ...m,
          research: {
            done: ["heavyCouplings"],
          },
        },
        "highDraftKilns",
      );
      const active = withResearch.research.active;
      const withArrived: Mountain =
        active === undefined
          ? withResearch
          : {
              ...withResearch,
              research: {
                ...withResearch.research,
                active: {
                  ...active,
                  arrived: { ...EMPTY_STOCK, brick: 200, parts: 50 },
                },
              },
            };

      const view = transportSheetView(withArrived, "one");
      // heavyCouplings (+40%) lifts wagon 18 -> 25/s and truck 400 -> 560/s in fleetSummary.
      expect(view.fleet).toContain("1 of 1 horse wagon (25/s)");
      expect(view.fleet).toContain("1 of 1 truck (560/s)");

      // Factory destInfo sums across active lines for each good.
      const brickRun = view.runs.find((r) => r.id === "stockToFactoryBrick");
      const brickRoom =
        makerInputRoom(withArrived, "partsPress", "brick") +
        makerInputRoom(withArrived, "precisionAssembly", "brick");
      expect(brickRun?.destText).toBe(`200 of ${formatCompact(brickRoom)}`);
      expect(brickRun?.destFill).toBeCloseTo(200 / brickRoom, 5);

      const cutRun = view.runs.find((r) => r.id === "stockToFactoryCutStone");
      const cutRoom =
        makerInputRoom(withArrived, "partsPress", "cutStone") +
        makerInputRoom(withArrived, "precisionAssembly", "cutStone");
      expect(cutRun?.destText).toBe(`100 of ${formatCompact(cutRoom)}`);
      expect(cutRun?.destFill).toBeCloseTo(100 / cutRoom, 5);

      const glassRun = view.runs.find((r) => r.id === "stockToFactoryGlass");
      const glassRoom = makerInputRoom(
        withArrived,
        "precisionAssembly",
        "glass",
      );
      expect(glassRun?.destText).toBe(`50 of ${formatCompact(glassRoom)}`);
      expect(glassRun?.destFill).toBeCloseTo(50 / glassRoom, 5);

      // Research destInfo shows arrived / required for each needed good (highDraftKilns requires parts + cutStone).
      const price = researchPrice("highDraftKilns");
      const resParts = view.runs.find((r) => r.id === "stockToResearch:parts");
      const reqParts = priceAmount(price, "parts");
      expect(resParts?.destText).toBe(`50 of ${formatCompact(reqParts)}`);
      expect(resParts?.destFill).toBeCloseTo(50 / reqParts, 5);
    });
  });
});

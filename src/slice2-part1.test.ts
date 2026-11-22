import { describe, expect, it } from "vitest";
import {
  SITE_GOOD_CAP,
  applyCityWork,
  buildRate,
  shareOutKeys,
  shareProportional,
  siteGoodRoom,
} from "./building-site";
import { holdOrder, placeOrder } from "./city";
import { transportPlate, vehicleKeys } from "./city-view";
import { withFactors } from "./economy/factors";
import { bestRaise, freshPlan } from "./lab/fresh-dad";
import casual from "./lab/fresh-policies/casual-2x10";
import mover from "./lab/fresh-policies/casual-mover";
import { freshView } from "./lab/fresh-view";
import { LAB_FACTORS } from "./lab/run";
import {
  BASE_INPUT_BUF,
  MAX_CYCLE_MICROS,
  makerInputRoom,
  makerMakes,
  stepMakerCycle,
} from "./makers";
import {
  NO_GRANITE_PILES,
  levelMachines,
  openLevels,
  withLevelMachine,
  withLevelPiles,
} from "./mine-levels";
import { flowMineToPitheadLive, landedMine } from "./mine-cages";
import { MIN_PITHEAD_ROOM, pitheadRoom } from "./mine-piles";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import {
  PART_THREE_OFF,
  PART_TWO_OFF,
  PLAY_FACTORS,
  SLICE_2_PART_1_OFF,
  slice2Part1On,
} from "./part-switch";
import { levels, partThree, slice2Part1 } from "./part-three.harness";
import { readGame, writeGame } from "./save-format";
import { slice2OrderRates, slice2SteadyIncome } from "./slice2-flow";
import { stockpileRoom } from "./stockyard";
import { tierById, tierCost } from "./tiers";
import {
  RUN_ORDER,
  applyTransportTransfer,
  fleetRate,
  planTransportTransfer,
  runSnapshots,
  vehiclePrice,
} from "./transport";
import { freeWorker, placeWorker } from "./workforce";

const SECOND = 1_000;
const HOUR = 3_600 * SECOND;

describe("slice 2 part 1 switch (#766, #769)", () => {
  it("is on in play (PLAY_FACTORS) and requires part2, part3, and slice2Part1 all at 0", () => {
    expect(PLAY_FACTORS[SLICE_2_PART_1_OFF]).toBe(0);
    expect(withFactors(PLAY_FACTORS, slice2Part1On)).toBe(true);
    expect(slice2Part1On()).toBe(false);
    partThree(() => {
      expect(slice2Part1On()).toBe(false);
    });
    withFactors({ [SLICE_2_PART_1_OFF]: 0 }, () => {
      expect(slice2Part1On()).toBe(false);
    });
    withFactors(
      { [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0, [SLICE_2_PART_1_OFF]: 0 },
      () => {
        expect(slice2Part1On()).toBe(true);
      },
    );
    slice2Part1(() => {
      expect(slice2Part1On()).toBe(true);
    });
  });
});

describe("generalized mineLevels (#766)", () => {
  it("tracks deeper level machines and piles and derives Topsoil as owned minus deeper", () => {
    slice2Part1(() => {
      const start = levels({
        machines: { cart: 2, drill: 1 },
        granitePiles: { face: 10, shaft: 5, saw: 0 },
      });
      const more: Mountain = {
        ...start,
        owned: { ...start.owned, cart: 5, drill: 3 },
      };
      expect(openLevels(more)).toEqual(["topsoil", "granite"]);
      expect(levelMachines(more, "granite")).toEqual({
        cart: 2,
        drill: 1,
        borer: 0,
        train: 0,
      });
      expect(levelMachines(more, "topsoil")).toEqual({
        cart: 3,
        drill: 2,
        borer: 0,
        train: 0,
      });
      const added = withLevelMachine(more, "granite", "drill");
      expect(levelMachines(added, "granite").drill).toBe(2);
      expect(levelMachines(added, "topsoil").drill).toBe(1);
      const piled = withLevelPiles(added, "granite", {
        ...NO_GRANITE_PILES,
        face: 42,
      });
      expect(piled.mineLevels.granite?.piles.face).toBe(42);
    });
  });

  it("returns unchanged mountain when mutating an unsunk level", () => {
    const fresh = createMountain();
    expect(withLevelMachine(fresh, "granite", "cart")).toBe(fresh);
    expect(withLevelPiles(fresh, "granite", NO_GRANITE_PILES)).toBe(fresh);
  });
});

describe("pithead buffers & zero Stone bypass (#766, rule 1.4)", () => {
  it("sizes pithead room with MIN_PITHEAD_ROOM=300 and scales via cagePileRoom", () => {
    slice2Part1(() => {
      const winchOnly = levels({ sunk: false, hoisting: 1, hoists: 0 });
      expect(pitheadRoom(winchOnly)).toBe(MIN_PITHEAD_ROOM);
      const manyHoists = levels({ sunk: false, hoisting: 4, hoists: 4 });
      expect(pitheadRoom(manyHoists)).toBeGreaterThan(MIN_PITHEAD_ROOM);
    });
  });

  it("unloads live cages strictly into pithead with zero Stone bypass and stalls when pithead is full", () => {
    slice2Part1(() => {
      const start = levels({
        sunk: false,
        hoisting: 1,
        hoists: 0,
        piles: { shaft: 300 },
        pithead: { topsoil: 0 },
        stock: { stones: 0 },
      });
      const after = flowMineToPitheadLive(start, 20, 1, false);
      expect(after.mountain.stock.stones).toBe(0);
      expect(after.mountain.pithead.topsoil).toBeGreaterThan(0);
      expect(after.mined).toBe(after.mountain.pithead.topsoil);

      // Fill pithead to room: cage waits at top with carried rock, zero bypass to stones.
      const room = pitheadRoom(start);
      const full = levels({
        sunk: false,
        hoisting: 1,
        hoists: 0,
        pithead: { topsoil: room },
        stock: { stones: 0 },
        trips: {
          winch: { level: "topsoil", carried: 90, leg: { kind: "top" } },
        },
      });
      const stalled = flowMineToPitheadLive(full, 10, 1, false);
      expect(stalled.mountain.stock.stones).toBe(0);
      expect(stalled.mountain.pithead.topsoil).toBe(room);
      expect(stalled.mountain.cages.trips.winch?.carried).toBe(90);

      // Landing cages before a night also pours strictly into pithead.
      const half = levels({
        sunk: false,
        hoisting: 1,
        hoists: 0,
        pithead: { topsoil: room - 40 },
        stock: { stones: 0 },
        trips: {
          winch: {
            level: "topsoil",
            carried: 90,
            leg: { kind: "up", left: 3 },
          },
        },
      });
      const landed = landedMine(half);
      expect(landed.mountain.stock.stones).toBe(0);
      expect(landed.mountain.pithead.topsoil).toBe(room);
      expect(landed.mountain.cages.trips.winch?.carried).toBe(50);
    });
  });
});

describe("makers input buffers & cycleMicros (#766, rule 3.2)", () => {
  it("sets buffer room to 0 when owned === 0 and scales to >= 60 s consumption once owned", () => {
    const empty = createMountain();
    expect(makerInputRoom(empty, "kiln")).toBe(0);
    expect(makerInputRoom(empty, "saw")).toBe(0);
    const oneKiln = { ...empty, makers: { kiln: 1, saw: 0 } };
    expect(makerInputRoom(oneKiln, "kiln")).toBeGreaterThanOrEqual(
      BASE_INPUT_BUF,
    );
    expect(makerInputRoom(oneKiln, "kiln")).toBe(12 * 2 * 60);
    const twoSaws = { ...empty, makers: { kiln: 0, saw: 2 } };
    expect(makerInputRoom(twoSaws, "saw")).toBe(2 * 30 * 3 * 60);
  });

  it("accumulates integer cycleMicros across 1 s ticks for a slow 1-per-60-s line with < 0.01% drift", () => {
    let held = 10_000;
    let produced = 0;
    let micros = 0;
    const rate = 1 / 60;
    for (let sec = 0; sec < 3_600; sec += 1) {
      const step = stepMakerCycle({
        inputs: [{ id: "topsoilRock", amount: 2, held }],
        outputAmount: 1,
        outputRoom: 10_000,
        staffedOutputRate: rate,
        dt: 1,
        cycleMicros: micros,
      });
      expect(Number.isInteger(step.nextMicros)).toBe(true);
      expect(step.nextMicros).toBeGreaterThanOrEqual(0);
      expect(step.nextMicros).toBeLessThanOrEqual(MAX_CYCLE_MICROS);
      expect(step.standing).toBe(false);
      held -= step.consumed.topsoilRock ?? 0;
      produced += step.produced;
      micros = step.nextMicros;
    }
    // 3600 s at 1/60 s = 60 cycles exact (or 59 with ~999_9xx micros left).
    expect(produced).toBeGreaterThanOrEqual(59);
    expect(produced).toBeLessThanOrEqual(60);
    expect(held).toBe(10_000 - produced * 2);
  });

  it("halts cleanly and resets cycleMicros without draining other inputs when any input is empty", () => {
    const step = stepMakerCycle({
      inputs: [
        { id: "topsoilRock", amount: 2, held: 100 },
        { id: "graniteRock", amount: 3, held: 2 },
      ],
      outputAmount: 1,
      outputRoom: 100,
      staffedOutputRate: 10,
      dt: 10,
      cycleMicros: 500_000,
    });
    expect(step.cycles).toBe(0);
    expect(step.produced).toBe(0);
    expect(step.consumed).toEqual({});
    expect(step.nextMicros).toBe(0);
    expect(step.standing).toBe(true);
  });

  it("handles floating-point exact products like 12 * 0.3 over 15 s without truncating a cycle", () => {
    const step = stepMakerCycle({
      inputs: [{ id: "topsoilRock", amount: 2, held: 108 }],
      outputAmount: 1,
      outputRoom: 100,
      staffedOutputRate: 12 * 0.3,
      dt: 15,
      cycleMicros: 0,
    });
    expect(step.cycles).toBe(54);
    expect(step.produced).toBe(54);
    expect(step.consumed).toEqual({ topsoilRock: 108 });
    expect(step.nextMicros).toBe(0);
  });
});

describe("per-good SITE_GOOD_CAP & integer sharing (#766, rule 4.2)", () => {
  it("gives each required good its own SITE_GOOD_CAP buffer and never overflows it", () => {
    slice2Part1(() => {
      const start = levels({
        operational: ["lightTower"],
        stock: { stones: 10_000, brick: 10_000 },
      });
      const ordered = placeOrder(start);
      expect(ordered.project.kind).toBe("delivering");
      if (ordered.project.kind !== "delivering") {
        return;
      }
      // Warehouse step 0 requires both stones and brick; each gets SITE_GOOD_CAP.
      expect(siteGoodRoom(ordered.project.site, "stones")).toBe(SITE_GOOD_CAP);
      expect(siteGoodRoom(ordered.project.site, "brick")).toBe(SITE_GOOD_CAP);

      const work = applyCityWork(
        ordered.project.site,
        { stones: 2_000, brick: 2_000 },
        100,
      );
      const stonesOnSite =
        ordered.project.site.onSite.stones +
        (work.delivered.stones ?? 0) -
        (work.built.stones ?? 0);
      const brickOnSite =
        ordered.project.site.onSite.brick +
        (work.delivered.brick ?? 0) -
        (work.built.brick ?? 0);
      expect(stonesOnSite).toBeLessThanOrEqual(SITE_GOOD_CAP);
      expect(brickOnSite).toBeLessThanOrEqual(SITE_GOOD_CAP);
      expect(stonesOnSite).toBeGreaterThanOrEqual(0);
      expect(brickOnSite).toBeGreaterThanOrEqual(0);
    });
  });

  it("conserves exact integers in shareOutKeys and shareProportional", () => {
    expect(shareOutKeys(10, ["a", "b", "c"], { a: 2, b: 100, c: 100 })).toEqual(
      { a: 2, b: 4, c: 4 },
    );
    const split = shareProportional(10, ["x", "y", "z"], {
      x: 10,
      y: 10,
      z: 10,
    });
    expect((split.x ?? 0) + (split.y ?? 0) + (split.z ?? 0)).toBe(10);
    expect(shareProportional(50, ["x", "y"], { x: 10, y: 15 })).toEqual({
      x: 10,
      y: 15,
    });
  });
});

describe("physical transport runs: water-filling & source contention (#766, rule 2)", () => {
  it("closes maker runs while makers === 0 and redistributes spare capacity via water-filling", () => {
    slice2Part1(() => {
      const m = levels({
        sunk: false,
        kilns: 0,
        pithead: { topsoil: 100 },
        stock: { stones: 0 },
        driving: 1,
      });
      const snaps = Object.fromEntries(runSnapshots(m).map((s) => [s.id, s]));
      expect(snaps.pitToStockyardStones?.open).toBe(true);
      expect(snaps.pitTopsoilToKilns?.open).toBe(false);
      expect(snaps.pitGraniteToSaws?.open).toBe(false);

      // With a kiln owned and a tiny kiln room left (3), spare fleet capacity flows to stones.
      const withKiln: Mountain = {
        ...m,
        makers: { kiln: 1, saw: 0 },
        makerBuffers: { kiln: { topsoilRock: 12 * 2 * 60 - 3 }, saw: {} },
      };
      const transfer = planTransportTransfer(withKiln, 9);
      expect(transfer.moved.pitTopsoilToKilns).toBe(3);
      expect(transfer.moved.pitToStockyardStones).toBe(6);
      const applied = applyTransportTransfer(withKiln, transfer);
      expect(applied.mountain.pithead.topsoil).toBe(91);
      expect(applied.mountain.stock.stones).toBe(6);
      expect(applied.mountain.makerBuffers.kiln.topsoilRock).toBe(12 * 2 * 60);
    });
  });

  it("splits scarce shared pithead proportionally between Stone and Kilns without overdrawing", () => {
    slice2Part1(() => {
      const m = levels({
        sunk: false,
        kilns: 1,
        pithead: { topsoil: 10 },
        stock: { stones: 0 },
        driving: 1,
      });
      const transfer = planTransportTransfer(m, 100);
      expect(
        transfer.moved.pitToStockyardStones + transfer.moved.pitTopsoilToKilns,
      ).toBe(10);
      expect(transfer.moved.pitToStockyardStones).toBe(5);
      expect(transfer.moved.pitTopsoilToKilns).toBe(5);
      const applied = applyTransportTransfer(m, transfer);
      expect(applied.mountain.pithead.topsoil).toBe(0);
    });
  });

  it("pulls proportionally across Topsoil and Granite pitheads for pitToStockyardStones", () => {
    slice2Part1(() => {
      const m = levels({
        sunk: true,
        pithead: { topsoil: 30, granite: 10 },
        stock: { stones: 0 },
        driving: 1,
      });
      const transfer = planTransportTransfer(m, 20);
      expect(transfer.moved.pitToStockyardStones).toBe(20);
      expect(transfer.stoneFromPithead).toEqual({
        topsoil: 15,
        granite: 5,
        crystal: 0,
      });
    });
  });

  it("is strictly monotonic when adding fleet capacity", () => {
    slice2Part1(() => {
      const m = levels({
        sunk: true,
        kilns: 1,
        saws: 1,
        pithead: { topsoil: 100, granite: 100 },
        stock: { stones: 100, brick: 100 },
        driving: 2,
      });
      const low = planTransportTransfer(m, 10);
      const high = planTransportTransfer(m, 25);
      const sum = (
        moved: Readonly<Record<(typeof RUN_ORDER)[number], number>>,
      ) => RUN_ORDER.reduce((acc, id) => acc + moved[id], 0);
      expect(sum(high.moved)).toBeGreaterThanOrEqual(sum(low.moved));
    });
  });
});

describe("Evening 1 single-worker loop & pre-Light-Tower night clock (#766)", () => {
  it("lets the 1 starting worker cycle drilling -> haulage -> hoisting -> driving to earn Stone", () => {
    slice2Part1(() => {
      let m = createMountain();
      expect(m.owned.helper).toBe(1);
      expect(m.jobs.drilling).toBe(1);
      expect(m.fleet.horseWagon).toBe(1);
      expect(m.stock.stones).toBe(0);

      // 1. Drill for 30 s -> face pile fills, zero stone yet.
      m = accrue({
        mountain: m,
        from: 0,
        to: 30 * SECOND,
        live: true,
      }).mountain;
      expect(m.piles.face).toBe(90);
      expect(m.stock.stones).toBe(0);

      // 2. Move worker to haulage for 20 s -> shaft pile fills, zero stone yet.
      m = placeWorker(freeWorker(m, "drilling"), "haulage");
      m = accrue({
        mountain: m,
        from: 0,
        to: 20 * SECOND,
        live: true,
      }).mountain;
      expect(m.piles.shaft).toBe(90);
      expect(m.stock.stones).toBe(0);

      // 3. Move worker to hoisting for 15 s -> pithead fills, STILL zero stone (zero bypass!).
      m = placeWorker(freeWorker(m, "haulage"), "hoisting");
      m = accrue({
        mountain: m,
        from: 0,
        to: 15 * SECOND,
        live: true,
      }).mountain;
      expect(m.pithead.topsoil).toBe(90);
      expect(m.stock.stones).toBe(0);

      // 4. Move worker to driving -> given horse wagon carries pithead rock to Stone!
      m = placeWorker(freeWorker(m, "hoisting"), "driving");
      expect(fleetRate(m)).toBe(18);
      m = accrue({
        mountain: m,
        from: 0,
        to: 5 * SECOND,
        live: true,
      }).mountain;
      expect(m.pithead.topsoil).toBe(0);
      expect(m.stock.stones).toBe(90);
    });
  });

  it("preserves the 8-hour pre-Light-Tower night clock in Slice 2", () => {
    slice2Part1(() => {
      const m = levels({
        sunk: false,
        operational: [],
        topsoil: 1,
        hoisting: 1,
        driving: 1,
      });
      const eight = accrueAway({ mountain: m, lastSeen: 0, now: 8 * HOUR });
      const sixteen = accrueAway({ mountain: m, lastSeen: 0, now: 16 * HOUR });
      expect(sixteen.report.capped).toBe(true);
      expect(sixteen.report.paidMs).toBe(8 * HOUR);
      expect(sixteen.report.night.stop).toBe("clock");
      // Drilling stops at 8 h; only residual piles/pithead drain after that.
      expect(sixteen.mountain.rockDug).toBe(eight.mountain.rockDug);
    });
  });
});

describe("v11 save shape & reserved assignedRuns (#766)", () => {
  const throughJson = (mountain: Mountain) =>
    readGame(JSON.parse(JSON.stringify(writeGame(mountain))), 0);

  it("round-trips granite into mineLevels, pithead, makerBuffers, cycleMicros, and reserved assignedRuns", () => {
    const start = levels({
      sunk: true,
      kilns: 2,
      saws: 1,
      pithead: { topsoil: 45, granite: 19 },
      machines: { cart: 1, drill: 1 },
      granitePiles: { face: 12, shaft: 8, saw: 0 },
    });
    const m: Mountain = {
      ...start,
      fleet: { horseWagon: 2, truck: 1 },
      makerBuffers: { kiln: { topsoilRock: 300 }, saw: { graniteRock: 150 } },
      cycleMicros: { kiln: 500_000, saw: 999_999 },
      assignedRuns: { pitToStockyardStones: 2, pitTopsoilToKilns: 1 },
    };
    const game = writeGame(m);
    expect(game.mineLevels).toEqual({
      granite: {
        machines: { cart: 1, drill: 1 },
        piles: { face: 12, shaft: 8 },
      },
    });
    expect(game.pithead).toEqual({ topsoil: 45, granite: 19 });
    expect(game.makerBuffers).toEqual({
      kiln: { topsoilRock: 300 },
      saw: { graniteRock: 150 },
    });
    expect(game.cycleMicros).toEqual({ kiln: 500_000, saw: 999_999 });
    expect(game.assignedRuns).toEqual({
      pitToStockyardStones: 2,
      pitTopsoilToKilns: 1,
    });
    expect(throughJson(m)).toEqual({ kind: "ok", mountain: m });
  });

  it("validates assignedRuns <= fleetSize (never clamping on jobs.driving) and rejects invalid fields", () => {
    // 2 vehicles owned, 0 drivers staffed -> assignedRuns sum 2 is valid!
    expect(
      readGame(
        {
          fleet: { horseWagon: 1, truck: 1 },
          assignedRuns: { pitToStockyardStones: 1, pitTopsoilToKilns: 1 },
        },
        0,
      ).kind,
    ).toBe("ok");
    // Sum 3 > fleetSize 2 -> bad; bad fleet propagates cleanly.
    expect(
      readGame(
        {
          fleet: { horseWagon: 1, truck: 1 },
          assignedRuns: { pitToStockyardStones: 2, pitTopsoilToKilns: 1 },
        },
        0,
      ).kind,
    ).toBe("bad");
    expect(
      readGame(
        {
          fleet: "nope",
          assignedRuns: { pitToStockyardStones: 1 },
        },
        0,
      ).kind,
    ).toBe("bad");
    // Unknown run id -> newer.
    expect(
      readGame(
        {
          fleet: { horseWagon: 2 },
          assignedRuns: { stockToFactoryBrick: 1 },
        },
        0,
      ).kind,
    ).toBe("newer");
    // cycleMicros past 999_999, negative, or non-record -> bad; 0 omitted; unknown maker -> newer.
    expect(readGame({ cycleMicros: "nope" }, 0).kind).toBe("bad");
    expect(readGame({ cycleMicros: { kiln: 1_000_000 } }, 0).kind).toBe("bad");
    expect(readGame({ cycleMicros: { kiln: -1 } }, 0).kind).toBe("bad");
    expect(readGame({ cycleMicros: { kiln: 0 } }, 0).kind).toBe("ok");
    expect(readGame({ cycleMicros: { glassworks: 100 } }, 0).kind).toBe(
      "newer",
    );
    // makerBuffers: non-record or bad nested count -> bad; unknown maker or input -> newer.
    expect(readGame({ makerBuffers: "nope" }, 0).kind).toBe("bad");
    expect(
      readGame({ makerBuffers: { kiln: { topsoilRock: -1 } } }, 0).kind,
    ).toBe("bad");
    expect(
      readGame({ makerBuffers: { kiln: { crystalRock: 1 } } }, 0).kind,
    ).toBe("newer");
    expect(
      readGame({ makerBuffers: { glassworks: { crystalRock: 1 } } }, 0).kind,
    ).toBe("newer");
    // Bad mineLevels propagates cleanly through pithead, makerBuffers, and cycleMicros.
    expect(
      readGame(
        {
          mineLevels: { granite: "nope" },
          pithead: { topsoil: 1 },
          makerBuffers: { kiln: { topsoilRock: 1 } },
          cycleMicros: { kiln: 10 },
        },
        0,
      ).kind,
    ).toBe("bad");
    // Unsunk granite rejects pithead.granite, makerBuffers.saw, cycleMicros.saw.
    expect(readGame({ pithead: { granite: 1 } }, 0).kind).toBe("bad");
    expect(
      readGame({ makerBuffers: { saw: { graniteRock: 1 } } }, 0).kind,
    ).toBe("bad");
    expect(readGame({ cycleMicros: { saw: 1 } }, 0).kind).toBe("bad");
    // Per-good SITE_GOOD_CAP allows 500 stones AND 500 brick on site simultaneously.
    slice2Part1(() => {
      expect(
        readGame(
          {
            marks: { operational: ["lightTower"] },
            project: {
              building: "warehouse",
              state: "delivering",
              step: 0,
              arrived: { stones: 500, brick: 500 },
              onSite: { stones: 500, brick: 500 },
            },
          },
          0,
        ).kind,
      ).toBe("ok");
    });
  });
});

describe("Part 1 lab & #757 economy rebalance (#767, #769)", () => {
  it("gates #757 economy retuning behind slice2Part1On() while PLAY_FACTORS and LAB_FACTORS enable it", () => {
    expect(PLAY_FACTORS[SLICE_2_PART_1_OFF]).toBe(0);
    expect(LAB_FACTORS[SLICE_2_PART_1_OFF]).toBe(0);
    const oneBuilder = {
      ...createMountain(),
      jobs: { ...createMountain().jobs, building: 1, driving: 1 },
    };
    partThree(() => {
      expect(buildRate(oneBuilder)).toBe(8);
      expect(fleetRate(oneBuilder)).toBe(9);
      expect(vehicleKeys(oneBuilder, "one")[0]?.face).toBe("+Wagon · 9/s");
      expect(transportPlate(oneBuilder).fleet).toContain("9/s");
      expect(makerMakes("saw")).toBe(30);
      expect(tierCost(tierById("borer"), 0)).toBe(40_000);
      expect(tierCost(tierById("train"), 0)).toBe(60_000);
      expect(vehiclePrice(oneBuilder, "truck")[0]?.amount).toBe(150_000);
    });
    for (const factors of [PLAY_FACTORS, LAB_FACTORS]) {
      withFactors(factors, () => {
        expect(buildRate(oneBuilder)).toBe(50);
        expect(fleetRate(oneBuilder)).toBe(18);
        expect(vehicleKeys(oneBuilder, "one")[0]?.face).toBe("+Wagon · 18/s");
        expect(transportPlate(oneBuilder).fleet).toContain("18/s");
        expect(makerMakes("saw")).toBe(50);
        expect(tierCost(tierById("borer"), 0)).toBe(12_000);
        expect(tierCost(tierById("train"), 0)).toBe(15_000);
        expect(vehiclePrice(oneBuilder, "truck")[0]?.amount).toBe(100_000);
        expect(tierCost(tierById("helper"), 100)).toBeLessThan(
          partThree(() => tierCost(tierById("helper"), 100)),
        );
      });
    }
  });

  it("computes steady physical transport income and City carry rate under slice2Part1On()", () => {
    slice2Part1(() => {
      const noDriver = levels({
        sunk: false,
        operational: [],
        topsoil: 2,
        hoisting: 2,
        driving: 0,
      });
      expect(slice2SteadyIncome(noDriver)).toEqual({
        stones: 0,
        brick: 0,
        cutStone: 0,
      });
      const driven = placeOrder(
        levels({
          sunk: false,
          operational: [],
          topsoil: 4,
          hoisting: 4,
          driving: 1,
          building: 1,
        }),
      );
      const steady = slice2SteadyIncome(driven);
      expect(steady.stones).toBeGreaterThan(0);
      const order = slice2OrderRates(driven);
      // Fleet (18/s) splits between pitToStockyardStones and stockToCity:stones.
      expect(order.income.stones).toBeCloseTo(9, 6);
      expect(order.cityCarry).toBeCloseTo(9, 6);
    });
  });

  it("rotates the lone Evening 1 worker onto driving when pithead rock waits, and keeps mover drivers active on hold", () => {
    slice2Part1(() => {
      const start = placeOrder(createMountain());
      const pitReady: Mountain = {
        ...start,
        jobs: { ...start.jobs, drilling: 0, hoisting: 1 },
        piles: { face: 0, shaft: 0, kiln: 0 },
        pithead: { topsoil: 90, granite: 0, crystal: 0 },
      };
      expect(freshPlan(pitReady, casual.fresh, casual.params.hoardK)).toEqual([
        { kind: "freeWorker", job: "hoisting", count: 1 },
        { kind: "placeWorker", job: "driving", count: 1 },
      ]);

      // Mover keeps staffed drivers on hold under Slice 2 physical transport.
      const held = holdOrder(
        placeOrder(
          levels({
            sunk: false,
            operational: [],
            topsoil: 2,
            hoisting: 2,
            driving: 1,
            building: 0,
          }),
        ),
      );
      const moverMoves = freshPlan(held, mover.fresh, mover.params.hoardK);
      expect(
        moverMoves.some(
          (action) => action.kind === "freeWorker" && action.job === "driving",
        ),
      ).toBe(false);

      // freshView treats staffed drivers as working on hold and checks per-good SITE_GOOD_CAP.
      const view = freshView(held);
      expect(view.siteFull).toBe(false);
      const fullStoneSite: Mountain = {
        ...placeOrder(held),
        project: {
          kind: "delivering",
          site: {
            building: "lightTower",
            step: 0,
            arrived: { ...held.stock, stones: SITE_GOOD_CAP },
            onSite: { ...held.stock, stones: SITE_GOOD_CAP },
          },
        },
      };
      expect(freshView(fullStoneSite).siteFull).toBe(true);
    });
  });

  it("never overflows stockpileRoom during offline stretches when site is near SITE_GOOD_CAP", () => {
    slice2Part1(() => {
      const base = placeOrder(
        levels({
          sunk: false,
          operational: ["lightTower", "warehouse"],
          topsoil: 6,
          hoisting: 6,
          driving: 4,
          building: 0,
        }),
      );
      const room = stockpileRoom(base, "stones");
      const nearFullSite: Mountain = {
        ...base,
        fleet: { horseWagon: 4, truck: 0 },
        stock: { ...base.stock, stones: room },
        pithead: { topsoil: 500, granite: 0, crystal: 0 },
        project: {
          kind: "delivering",
          site: {
            building: "foundry",
            step: 0,
            arrived: { ...base.stock, stones: SITE_GOOD_CAP - 1 },
            onSite: { ...base.stock, stones: SITE_GOOD_CAP - 1 },
          },
        },
      };
      const after = accrueAway({
        mountain: nearFullSite,
        lastSeen: 0,
        now: 10 * SECOND,
      }).mountain;
      expect(after.stock.stones).toBeLessThanOrEqual(room);
      expect(
        after.project.kind === "delivering"
          ? after.project.site.onSite.stones
          : 0,
      ).toBeLessThanOrEqual(SITE_GOOD_CAP);
    });
  });

  it("excludes brick-priced trucks from stone-priced bestRaise while waiting for the shaft", () => {
    slice2Part1(() => {
      const base = levels({
        sunk: false,
        operational: ["lightTower", "warehouse"],
        topsoil: 10,
        hoisting: 10,
        driving: 1,
        building: 0,
      });
      const waiting: Mountain = {
        ...base,
        fleet: { horseWagon: 1, truck: 0 },
        stock: { ...base.stock, stones: 200_000, brick: 0 },
      };
      const raise = bestRaise(waiting, casual.fresh);
      expect(
        raise?.plan.some(
          (action) => action.kind === "buyVehicle" && action.id === "truck",
        ) ?? false,
      ).toBe(false);
    });
  });

  it("never places an extra driver beyond fleetSize when casual-mover holds with pithead rock waiting", () => {
    slice2Part1(() => {
      const held = holdOrder(
        placeOrder(
          levels({
            sunk: false,
            operational: [],
            topsoil: 1,
            hoisting: 1,
            driving: 1,
            building: 0,
          }),
        ),
      );
      const fullPit: Mountain = {
        ...held,
        piles: { face: 0, shaft: 0, kiln: 0 },
        pithead: { topsoil: 500, granite: 0, crystal: 0 },
        jobs: { ...held.jobs, drilling: 0, haulage: 1, hoisting: 1 },
      };
      const plan = freshPlan(fullPit, mover.fresh, mover.params.hoardK);
      expect(
        plan.some(
          (action) => action.kind === "placeWorker" && action.job === "driving",
        ),
      ).toBe(false);
    });
  });
});

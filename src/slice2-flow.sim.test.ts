import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SITE_GOOD_CAP } from "./building-site";
import { buildingById, placeOrder } from "./city";
import { MAX_CYCLE_MICROS, makerInputRoom, makerTakes } from "./makers";
import { pitheadRoom } from "./mine-piles";
import { accrue, accrueAway, type Mountain } from "./mountain";
import { levels, slice2Part1, type Setup } from "./part-three.harness";
import { effectiveRates } from "./rates";
import { readGame, writeGame } from "./save-format";
import { GOOD_IDS, priceAmount } from "./stock";
import { stockpileRoom } from "./stockyard";
import { fleetSize, RUN_ORDER } from "./transport";

/**
 * Slice 2 Part 1 simulation & property tests (#766, spec rule 5.3):
 * - 8-hour live 1 s ticks vs. event-driven offline stretches agree within <= 1%
 *   across representative Slice 2 Part 1 states (Evening 1, Light Tower + Kilns,
 *   Granite + Saws + multi-good City order, slow 1/60 s maker line, and pithead
 *   saturation).
 * - Fast-check invariants: rock/goods conservation, buffer bounds, per-good
 *   SITE_GOOD_CAP, cycleMicros bounds, fleet monotonicity, and JSON save round-trip.
 */

const SECOND_MS = 1_000;
const EIGHT_HOURS_MS = 8 * 3_600 * SECOND_MS;
const AGREEMENT_TOLERANCE = 0.01;
const SIM_TIMEOUT_MS = 60_000;

/** Goods already built into completed earlier steps of the current building. */
function priorStepsBuilt(
  mountain: Mountain,
  good: "stones" | "brick" | "cutStone",
): number {
  if (mountain.project.kind === "unordered") {
    return 0;
  }
  const building = buildingById(mountain.project.site.building);
  let sum = 0;
  for (let s = 0; s < mountain.project.site.step; s += 1) {
    const req = building.steps[s];
    if (req !== undefined) {
      sum += priceAmount(req, good);
    }
  }
  return sum;
}

/** Total built goods on the active project (including completed prior steps). */
function projectBuilt(mountain: Mountain): {
  readonly stones: number;
  readonly brick: number;
  readonly cutStone: number;
} {
  if (mountain.project.kind === "unordered") {
    return { stones: 0, brick: 0, cutStone: 0 };
  }
  const { arrived, onSite } = mountain.project.site;
  return {
    stones:
      priorStepsBuilt(mountain, "stones") + arrived.stones - onSite.stones,
    brick: priorStepsBuilt(mountain, "brick") + arrived.brick - onSite.brick,
    cutStone:
      priorStepsBuilt(mountain, "cutStone") +
      arrived.cutStone -
      onSite.cutStone,
  };
}

/** Total goods produced or delivered (stock + completed steps + arrived on site). */
function goodTotal(
  mountain: Mountain,
  good: "stones" | "brick" | "cutStone",
): number {
  const arrived =
    mountain.project.kind === "unordered"
      ? 0
      : priorStepsBuilt(mountain, good) + mountain.project.site.arrived[good];
  return mountain.stock[good] + arrived;
}

/**
 * Total rock-equivalents held everywhere in the Slice 2 system:
 * underground piles + cage loads + pithead + maker buffers + stones +
 * kiln/saw rock embodied in brick/cutStone (both stock and City arrived).
 * Under conservation, `delta(rockEquivalents) === delta(rockDug)` (within
 * in-flight live cage loads).
 */
function rockEquivalents(mountain: Mountain): number {
  const topPiles = mountain.piles.face + mountain.piles.shaft;
  const gran = mountain.mineLevels.granite;
  const granPiles = gran === undefined ? 0 : gran.piles.face + gran.piles.shaft;
  const pithead = mountain.pithead.topsoil + mountain.pithead.granite;
  const makerBuf =
    (mountain.makerBuffers.kiln.topsoilRock ?? 0) +
    (mountain.makerBuffers.saw.graniteRock ?? 0);
  const stones = goodTotal(mountain, "stones");
  const brick = goodTotal(mountain, "brick") * makerTakes("kiln");
  const cutStone = goodTotal(mountain, "cutStone") * makerTakes("saw");
  const cageLoad = Object.values(mountain.cages.trips).reduce(
    (sum, cage) => sum + (cage?.carried ?? 0),
    0,
  );
  return (
    topPiles +
    granPiles +
    pithead +
    makerBuf +
    stones +
    brick +
    cutStone +
    cageLoad
  );
}

function expectWithinOnePercent(
  label: string,
  liveValue: number,
  offlineValue: number,
  floorSlack = 10,
): void {
  const scale = Math.max(liveValue, offlineValue);
  const diff = Math.abs(liveValue - offlineValue);
  const limit = Math.max(floorSlack, Math.ceil(scale * AGREEMENT_TOLERANCE));
  expect(
    diff,
    `${label}: live=${String(liveValue)} offline=${String(offlineValue)} diff=${String(diff)} limit=${String(limit)}`,
  ).toBeLessThanOrEqual(limit);
}

function buildScenario(
  setup: Setup,
  order: boolean,
  knobs: Readonly<Record<string, number>> = {},
): Mountain {
  return slice2Part1(() => {
    const base = levels(setup);
    return order ? placeOrder(base) : base;
  }, knobs);
}

function runEightHours(
  start: Mountain,
  knobs: Readonly<Record<string, number>> = {},
): {
  readonly live: Mountain;
  readonly offline: Mountain;
  readonly liveNight: Mountain;
  readonly away: Mountain;
} {
  return slice2Part1(() => {
    const live = accrue({
      mountain: start,
      from: 0,
      to: EIGHT_HOURS_MS,
      pay: 1,
      live: true,
    }).mountain;
    const offline = accrue({
      mountain: start,
      from: 0,
      to: EIGHT_HOURS_MS,
      pay: 1,
      live: false,
    }).mountain;
    const awayPay = effectiveRates(start).awayPay;
    const liveNight = accrue({
      mountain: start,
      from: 0,
      to: EIGHT_HOURS_MS,
      pay: awayPay,
      live: true,
    }).mountain;
    const away = accrueAway({
      mountain: start,
      lastSeen: 0,
      now: EIGHT_HOURS_MS,
    }).mountain;
    return { live, offline, liveNight, away };
  }, knobs);
}

describe("Slice 2 Part 1: 8-hour live vs. offline agreement <= 1% (#766, rule 5.3)", () => {
  it(
    "agrees within 1% on Evening 1 crew (4 workers + 1 horse wagon + Light Tower)",
    () => {
      const start = buildScenario(
        {
          sunk: false,
          operational: [],
          hoists: 0,
          assigned: { topsoil: 0, granite: 0 },
          fleet: { horseWagon: 1, truck: 0 },
          jobs: {
            drilling: 1,
            haulage: 1,
            hoisting: 1,
            driving: 1,
            building: 1,
          },
          stock: { stones: 0, brick: 0, cutStone: 0 },
        },
        true,
      );
      const { live, offline, liveNight, away } = runEightHours(start);
      expect(goodTotal(live, "stones")).toBeGreaterThan(0);
      expectWithinOnePercent(
        "evening1 stones (offline)",
        goodTotal(live, "stones"),
        goodTotal(offline, "stones"),
      );
      expectWithinOnePercent(
        "evening1 stones (away)",
        goodTotal(liveNight, "stones"),
        goodTotal(away, "stones"),
      );
      expectWithinOnePercent(
        "evening1 built stones",
        projectBuilt(live).stones,
        projectBuilt(offline).stones,
      );
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "agrees within 1% on Light Tower up + Kilns + shared Topsoil pithead + Warehouse",
    () => {
      const start = buildScenario(
        {
          sunk: false,
          operational: ["lightTower"],
          hoists: 1,
          machines: { drill: 2, cart: 2 },
          assigned: { topsoil: 0, granite: 0 },
          kilns: 2,
          onKilns: 4,
          fleet: { horseWagon: 3, truck: 0 },
          jobs: {
            drilling: 8,
            haulage: 8,
            hoisting: 2,
            driving: 3,
            building: 3,
          },
          stock: { stones: 0, brick: 0, cutStone: 0 },
        },
        true,
      );
      const { live, offline, liveNight, away } = runEightHours(start);
      expect(goodTotal(live, "stones")).toBeGreaterThan(0);
      expect(goodTotal(live, "brick")).toBeGreaterThan(0);
      expectWithinOnePercent(
        "kilns stones (offline)",
        goodTotal(live, "stones"),
        goodTotal(offline, "stones"),
      );
      expectWithinOnePercent(
        "kilns brick (offline)",
        goodTotal(live, "brick"),
        goodTotal(offline, "brick"),
      );
      expectWithinOnePercent(
        "kilns brick (away)",
        goodTotal(liveNight, "brick"),
        goodTotal(away, "brick"),
      );
      expectWithinOnePercent(
        "kilns built stones",
        projectBuilt(live).stones,
        projectBuilt(offline).stones,
      );
      expectWithinOnePercent(
        "kilns built brick",
        projectBuilt(live).brick,
        projectBuilt(offline).brick,
      );
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "agrees within 1% on Granite sunk + Kilns + Saws + multi-good Foundry order",
    () => {
      const start = buildScenario(
        {
          sunk: true,
          operational: ["lightTower", "warehouse"],
          hoists: 2,
          assigned: { topsoil: 1, granite: 1 },
          machines: { drill: 2, cart: 2 },
          kilns: 2,
          onKilns: 4,
          saws: 2,
          onSaws: 4,
          fleet: { horseWagon: 6, truck: 0 },
          jobs: {
            drilling: 10,
            haulage: 10,
            graniteDrilling: 10,
            graniteHaulage: 10,
            hoisting: 4,
            driving: 6,
            building: 6,
          },
          stock: { stones: 0, brick: 0, cutStone: 0 },
        },
        true,
      );
      const { live, offline, liveNight, away } = runEightHours(start);
      expect(goodTotal(live, "brick")).toBeGreaterThan(0);
      expect(goodTotal(live, "cutStone")).toBeGreaterThan(0);
      expectWithinOnePercent(
        "granite stones",
        goodTotal(live, "stones"),
        goodTotal(offline, "stones"),
      );
      expectWithinOnePercent(
        "granite brick",
        goodTotal(live, "brick"),
        goodTotal(offline, "brick"),
      );
      expectWithinOnePercent(
        "granite cutStone (offline)",
        goodTotal(live, "cutStone"),
        goodTotal(offline, "cutStone"),
      );
      expectWithinOnePercent(
        "granite cutStone (away)",
        goodTotal(liveNight, "cutStone"),
        goodTotal(away, "cutStone"),
      );
      expectWithinOnePercent(
        "granite built brick",
        projectBuilt(live).brick,
        projectBuilt(offline).brick,
      );
      expectWithinOnePercent(
        "granite built cutStone",
        projectBuilt(live).cutStone,
        projectBuilt(offline).cutStone,
      );
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "agrees within 1% on a slow 1-per-60-s maker line (cycleMicros persistence)",
    () => {
      // 1 running kiln makes 12 brick/s at pay=1; pay = 1/(60*12) gives exact 1/60 brick/s.
      const slowPay = 1 / (60 * 12);
      const start = buildScenario(
        {
          sunk: false,
          operational: ["lightTower"],
          hoists: 1,
          assigned: { topsoil: 0, granite: 0 },
          kilns: 1,
          onKilns: 1,
          fleet: { horseWagon: 1, truck: 1 },
          pithead: { topsoil: 5_000, granite: 0 },
          jobs: {
            drilling: 0,
            haulage: 0,
            hoisting: 0,
            driving: 2,
          },
          stock: { stones: 0, brick: 0, cutStone: 0 },
        },
        false,
      );
      const { live, offline } = slice2Part1(() => ({
        live: accrue({
          mountain: start,
          from: 0,
          to: EIGHT_HOURS_MS,
          pay: slowPay,
          live: true,
        }).mountain,
        offline: accrue({
          mountain: start,
          from: 0,
          to: EIGHT_HOURS_MS,
          pay: slowPay,
          live: false,
        }).mountain,
      }));
      expect(live.stock.brick).toBeGreaterThan(450);
      expect(live.stock.brick).toBeLessThanOrEqual(480);
      expectWithinOnePercent(
        "slow kiln brick",
        live.stock.brick,
        offline.stock.brick,
        2,
      );
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "agrees within 1% under pithead saturation & tight fleet bottleneck",
    () => {
      const start = buildScenario(
        {
          sunk: false,
          operational: ["lightTower"],
          hoists: 2,
          assigned: { topsoil: 0, granite: 0 },
          kilns: 1,
          onKilns: 2,
          fleet: { horseWagon: 1, truck: 0 },
          jobs: {
            drilling: 8,
            haulage: 8,
            hoisting: 4,
            driving: 1,
          },
          stock: { stones: 0, brick: 0, cutStone: 0 },
        },
        false,
      );
      const { live, offline } = runEightHours(start);
      expect(live.pithead.topsoil).toBeGreaterThan(0);
      expectWithinOnePercent(
        "saturated stones",
        live.stock.stones,
        offline.stock.stones,
      );
      expectWithinOnePercent(
        "saturated brick",
        live.stock.brick,
        offline.stock.brick,
      );
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "agrees within 1% on asymmetric two-level mine (Granite sunk, Kilns on, Saws 0)",
    () => {
      const start = buildScenario(
        {
          sunk: true,
          operational: ["lightTower"],
          hoists: 0,
          kilns: 1,
          onKilns: 1,
          saws: 0,
          onSaws: 0,
          fleet: { horseWagon: 1, truck: 1 },
          jobs: {
            drilling: 3,
            haulage: 3,
            graniteDrilling: 3,
            graniteHaulage: 3,
            hoisting: 2,
            driving: 2,
          },
          stock: { stones: 0, brick: 0, cutStone: 0 },
        },
        false,
      );
      const { live, offline } = runEightHours(start);
      expect(live.stock.stones).toBeGreaterThan(0);
      expect(live.stock.brick).toBeGreaterThan(0);
      expect(offline.pithead.granite).toBeLessThanOrEqual(pitheadRoom(offline));
      expectWithinOnePercent(
        "asymmetric stones",
        live.stock.stones,
        offline.stock.stones,
      );
      expectWithinOnePercent(
        "asymmetric brick",
        live.stock.brick,
        offline.stock.brick,
      );
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "agrees within 1% on high-throughput City delivery (> SITE_GOOD_CAP/s)",
    () => {
      const start = buildScenario(
        {
          sunk: false,
          operational: ["lightTower"],
          hoists: 0,
          fleet: { horseWagon: 0, truck: 4 },
          jobs: {
            driving: 4,
            building: 200,
          },
          stock: { stones: 5_000_000, brick: 0, cutStone: 0 },
        },
        true,
      );
      const live = slice2Part1(
        () =>
          accrue({
            mountain: start,
            from: 0,
            to: 1_800 * SECOND_MS,
            pay: 1,
            live: true,
          }).mountain,
      );
      const offline = slice2Part1(
        () =>
          accrue({
            mountain: start,
            from: 0,
            to: 1_800 * SECOND_MS,
            pay: 1,
            live: false,
          }).mountain,
      );
      expect(projectBuilt(live).stones).toBeGreaterThan(2_500_000);
      if (live.project.kind !== "unordered") {
        expect(live.project.site.onSite.stones).toBeLessThanOrEqual(
          SITE_GOOD_CAP,
        );
      }
      expectWithinOnePercent(
        "high-throughput city built stones",
        projectBuilt(live).stones,
        projectBuilt(offline).stones,
      );
    },
    SIM_TIMEOUT_MS,
  );
});

describe("Slice 2 Part 1: fast-check economy & conservation invariants (#766)", () => {
  const randomSetupArb = fc.record({
    sunk: fc.boolean(),
    hoists: fc.integer({ min: 0, max: 3 }),
    kilns: fc.integer({ min: 0, max: 2 }),
    saws: fc.integer({ min: 0, max: 2 }),
    wagons: fc.integer({ min: 1, max: 3 }),
    carts: fc.integer({ min: 0, max: 2 }),
    drilling: fc.integer({ min: 0, max: 6 }),
    haulage: fc.integer({ min: 0, max: 6 }),
    graniteDrilling: fc.integer({ min: 0, max: 6 }),
    graniteHaulage: fc.integer({ min: 0, max: 6 }),
    hoisting: fc.integer({ min: 0, max: 5 }),
    driving: fc.integer({ min: 0, max: 5 }),
    building: fc.integer({ min: 0, max: 5 }),
    onKilns: fc.integer({ min: 0, max: 4 }),
    onSaws: fc.integer({ min: 0, max: 4 }),
    order: fc.boolean(),
    liveSeconds: fc.integer({ min: 1, max: 180 }),
    awaySeconds: fc.integer({ min: 1, max: 3_600 }),
  });

  function assertMountainInvariants(mountain: Mountain): void {
    const pRoom = pitheadRoom(mountain);
    expect(mountain.pithead.topsoil).toBeGreaterThanOrEqual(0);
    expect(mountain.pithead.topsoil).toBeLessThanOrEqual(pRoom);
    expect(mountain.pithead.granite).toBeGreaterThanOrEqual(0);
    expect(mountain.pithead.granite).toBeLessThanOrEqual(pRoom);
    if (mountain.mineLevels.granite === undefined) {
      expect(mountain.pithead.granite).toBe(0);
      expect(mountain.makerBuffers.saw.graniteRock ?? 0).toBe(0);
      expect(mountain.cycleMicros.saw ?? 0).toBe(0);
    }
    const kilnBuf = mountain.makerBuffers.kiln.topsoilRock ?? 0;
    const sawBuf = mountain.makerBuffers.saw.graniteRock ?? 0;
    expect(kilnBuf).toBeGreaterThanOrEqual(0);
    expect(kilnBuf).toBeLessThanOrEqual(makerInputRoom(mountain, "kiln"));
    expect(sawBuf).toBeGreaterThanOrEqual(0);
    expect(sawBuf).toBeLessThanOrEqual(makerInputRoom(mountain, "saw"));
    for (const micros of Object.values(mountain.cycleMicros)) {
      expect(micros).toBeGreaterThanOrEqual(0);
      expect(micros).toBeLessThanOrEqual(MAX_CYCLE_MICROS);
      expect(Number.isInteger(micros)).toBe(true);
    }
    const assignedSum = RUN_ORDER.reduce(
      (sum, id) => sum + (mountain.assignedRuns[id] ?? 0),
      0,
    );
    expect(assignedSum).toBeLessThanOrEqual(fleetSize(mountain));
    if (mountain.project.kind !== "unordered") {
      for (const good of GOOD_IDS) {
        expect(mountain.project.site.onSite[good]).toBeGreaterThanOrEqual(0);
        expect(mountain.project.site.onSite[good]).toBeLessThanOrEqual(
          SITE_GOOD_CAP,
        );
        expect(mountain.project.site.onSite[good]).toBeLessThanOrEqual(
          mountain.project.site.arrived[good],
        );
      }
    }
    for (const good of GOOD_IDS) {
      expect(mountain.stock[good]).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(mountain.stock[good])).toBe(true);
      const room = stockpileRoom(mountain, good);
      if (Number.isFinite(room)) {
        expect(mountain.stock[good]).toBeLessThanOrEqual(room);
      }
    }
  }

  it(
    "conserves rock-equivalents, bounds all buffers, and round-trips through save JSON",
    () => {
      fc.assert(
        fc.property(randomSetupArb, (cfg) => {
          slice2Part1(() => {
            const topAssigned = cfg.sunk ? Math.floor(cfg.hoists / 2) : 0;
            const granAssigned = cfg.sunk ? cfg.hoists - topAssigned : 0;
            const base = levels({
              sunk: cfg.sunk,
              operational: cfg.sunk
                ? ["lightTower", "warehouse"]
                : ["lightTower"],
              hoists: cfg.hoists,
              assigned: { topsoil: topAssigned, granite: granAssigned },
              kilns: cfg.kilns,
              onKilns: cfg.onKilns,
              saws: cfg.sunk ? cfg.saws : 0,
              onSaws: cfg.sunk ? cfg.onSaws : 0,
              fleet: { horseWagon: cfg.wagons, truck: cfg.carts },
              jobs: {
                drilling: cfg.drilling,
                haulage: cfg.haulage,
                graniteDrilling: cfg.sunk ? cfg.graniteDrilling : 0,
                graniteHaulage: cfg.sunk ? cfg.graniteHaulage : 0,
                hoisting: cfg.hoisting,
                driving: cfg.driving,
                building: cfg.building,
              },
              stock: { stones: 0, brick: 0, cutStone: 0 },
            });
            const start = cfg.order ? placeOrder(base) : base;
            assertMountainInvariants(start);

            // Live stretch
            const afterLive = accrue({
              mountain: start,
              from: 0,
              to: cfg.liveSeconds * SECOND_MS,
              live: true,
            }).mountain;
            assertMountainInvariants(afterLive);
            expect(rockEquivalents(afterLive) - rockEquivalents(start)).toBe(
              afterLive.rockDug - start.rockDug,
            );

            // Offline stretch following live
            const afterOffline = accrue({
              mountain: afterLive,
              from: cfg.liveSeconds * SECOND_MS,
              to: (cfg.liveSeconds + cfg.awaySeconds) * SECOND_MS,
              live: false,
            }).mountain;
            assertMountainInvariants(afterOffline);
            expect(
              rockEquivalents(afterOffline) - rockEquivalents(afterLive),
            ).toBe(afterOffline.rockDug - afterLive.rockDug);

            // Save JSON round-trip
            const wire: unknown = JSON.parse(
              JSON.stringify(writeGame(afterOffline)),
            );
            const restored = readGame(wire, 0);
            expect(restored.kind).toBe("ok");
            if (restored.kind === "ok") {
              expect(restored.mountain.pithead).toEqual(afterOffline.pithead);
              expect(restored.mountain.makerBuffers).toEqual(
                afterOffline.makerBuffers,
              );
              expect(restored.mountain.cycleMicros).toEqual(
                afterOffline.cycleMicros,
              );
              expect(restored.mountain.assignedRuns).toEqual(
                afterOffline.assignedRuns,
              );
            }
          });
        }),
        { numRuns: 40 },
      );
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "is monotonic when adding a transport vehicle",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 4 }),
          fc.integer({ min: 1, max: 4 }),
          fc.integer({ min: 1, max: 4 }),
          (wagons, driving, kilns) => {
            slice2Part1(() => {
              const make = (extraWagons: number): Mountain =>
                levels({
                  sunk: false,
                  operational: ["lightTower"],
                  hoists: 1,
                  assigned: { topsoil: 0, granite: 0 },
                  kilns,
                  onKilns: kilns * 2,
                  fleet: { horseWagon: wagons + extraWagons, truck: 0 },
                  pithead: { topsoil: 5_000, granite: 0 },
                  jobs: {
                    drilling: 4,
                    haulage: 4,
                    hoisting: 2,
                    driving: driving + extraWagons,
                  },
                  stock: { stones: 0, brick: 0, cutStone: 0 },
                });
              const base = accrue({
                mountain: make(0),
                from: 0,
                to: 600 * SECOND_MS,
                live: true,
              }).mountain;
              const more = accrue({
                mountain: make(1),
                from: 0,
                to: 600 * SECOND_MS,
                live: true,
              }).mountain;
              const movedBase =
                base.stock.stones +
                base.stock.brick * makerTakes("kiln") +
                (base.makerBuffers.kiln.topsoilRock ?? 0);
              const movedMore =
                more.stock.stones +
                more.stock.brick * makerTakes("kiln") +
                (more.makerBuffers.kiln.topsoilRock ?? 0);
              expect(movedMore).toBeGreaterThanOrEqual(movedBase);
            });
          },
        ),
        { numRuns: 30 },
      );
    },
    SIM_TIMEOUT_MS,
  );
});

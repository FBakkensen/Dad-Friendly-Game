import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { mineMoves } from "./mine-piles";
import { accrue, accrueAway, createMountain, type Mountain } from "./mountain";
import { PART_TWO_OFF } from "./part-switch";
import { EMPTY_STOCK, type Stock } from "./stock";
import { nextBuilding, placeOrder, type Project } from "./city";
import { stockpileRoom } from "./stockyard";

/**
 * Part 2's rules in play (slice 1, rules 3 and 4, #666): the kilns make brick
 * from the rock hoisting lifts, what they cannot take bypasses to stone, a
 * full stockpile takes no more, and a night runs until the stockyard is full.
 */
const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);
const partOne = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const HOUR = 60 * 60 * 1000;

type Setup = {
  /** Workers on each of the three stages: 3 a second each, with tools. */
  readonly line?: number;
  readonly kilns?: number;
  readonly onKilns?: number;
  readonly stock?: Partial<Stock>;
  readonly kilnPile?: number;
  readonly operational?: Mountain["operational"];
  readonly project?: Project;
  readonly driving?: number;
  readonly building?: number;
};

/** A fresh mine with the Light Tower up (by default) and these workers and kilns. */
function works({
  line = 6,
  kilns = 0,
  onKilns = kilns,
  stock = {},
  kilnPile = 0,
  operational = ["lightTower"],
  project = { kind: "unordered" },
  driving = 0,
  building = 0,
}: Setup): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: {
      ...start.owned,
      helper: 3 * line + onKilns + driving + building,
    },
    jobs: {
      drilling: line,
      haulage: line,
      hoisting: line,
      driving,
      building,
      kilns: onKilns,
    },
    stock: { ...EMPTY_STOCK, ...stock },
    makers: { kiln: kilns },
    piles: { face: 300, shaft: 300, kiln: kilnPile },
    operational,
    project,
  };
}

const live = (mountain: Mountain, seconds: number) =>
  accrue({ mountain, from: 0, to: seconds * 1000 });

const night = (mountain: Mountain, awayMs: number) =>
  accrueAway({ mountain, lastSeen: 0, now: awayMs });

describe("the kilns make brick (#666)", () => {
  it("brings everything up as stone with no kiln", () => {
    partTwo(() => {
      const after = live(works({}), 100);
      expect(after.mined).toBe(1_800);
      expect(after.mountain.stock.stones).toBe(1_800);
      expect(after.mountain.stock.brick).toBe(0);
    });
  });

  it("fills the rock at the kilns first, then what they cannot take bypasses to stone", () => {
    partTwo(() => {
      // 18 a second lifted, one kiln takes 12: the pile of 300 fills in 50 s.
      const after = live(works({ kilns: 1 }), 100);
      expect(after.mined).toBe(1_800);
      expect(after.mountain.stock.brick).toBe(1_200);
      expect(after.mountain.piles.kiln).toBe(300);
      expect(after.mountain.stock.stones).toBe(300);
    });
  });

  it("a kiln with nobody on it is idle: its pile fills, and the rest is stone", () => {
    partTwo(() => {
      const after = live(works({ kilns: 2, onKilns: 0 }), 100);
      expect(after.mountain.stock.brick).toBe(0);
      expect(after.mountain.piles.kiln).toBe(300);
      expect(after.mountain.stock.stones).toBe(1_500);
    });
  });

  it("kilns go on from their pile while hoisting stands", () => {
    partTwo(() => {
      const after = live(works({ line: 0, kilns: 1, kilnPile: 300 }), 10);
      expect(after.mountain.stock.brick).toBe(120);
      expect(after.mountain.piles.kiln).toBe(180);
    });
  });
});

describe("a full stockpile takes no more (#666)", () => {
  it("rock for a full brick stockpile bypasses to stone", () => {
    partTwo(() => {
      const after = live(
        works({ kilns: 1, kilnPile: 300, stock: { brick: 500_000 } }),
        100,
      );
      expect(after.mountain.stock.brick).toBe(500_000);
      expect(after.mountain.stock.stones).toBe(1_800);
      expect(after.mined).toBe(1_800);
    });
  });

  it("with the stone stockpile full, the kilns' share still comes up", () => {
    partTwo(() => {
      const after = live(
        works({ kilns: 1, kilnPile: 300, stock: { stones: 3_000_000 } }),
        100,
      );
      expect(after.mountain.stock.stones).toBe(3_000_000);
      expect(after.mountain.stock.brick).toBe(1_200);
      expect(after.mined).toBe(1_200);
    });
  });

  it("with both full, nothing flows and the line stands", () => {
    partTwo(() => {
      const full = works({
        kilns: 1,
        kilnPile: 300,
        stock: { stones: 3_000_000, brick: 500_000 },
      });
      expect(mineMoves(full)).toBe(false);
      const after = live(full, 100);
      expect(after.mined).toBe(0);
      expect(after.mountain.stock).toEqual(full.stock);
    });
  });

  it("takes nothing away from a stockpile over its room", () => {
    partTwo(() => {
      const over = works({ stock: { stones: 3_500_000 } });
      const after = live(over, 100);
      expect(after.mountain.stock.stones).toBe(3_500_000);
      expect(mineMoves(over)).toBe(false);
    });
  });

  it("has no limit before the Light Tower, and none in part 1", () => {
    partTwo(() => {
      const dark = works({ operational: [], stock: { stones: 9_000_000 } });
      expect(live(dark, 10).mountain.stock.stones).toBe(9_000_180);
    });
    partOne(() => {
      const lit = works({ stock: { stones: 9_000_000 } });
      expect(live(lit, 10).mountain.stock.stones).toBe(9_000_180);
    });
  });

  it("loses no rock while the stone stockpile has room, and never takes from a stockpile", () => {
    partTwo(() => {
      fc.assert(
        fc.property(
          fc.nat(8),
          fc.nat(4),
          fc.nat(4),
          fc.nat(300),
          fc.nat(3_000_100),
          fc.nat(500_100),
          fc.integer({ min: 1, max: 4_000 }),
          (line, kilns, onKilns, kilnPile, stones, brick, seconds) => {
            const before = works({
              line,
              kilns,
              onKilns,
              kilnPile: kilns > 0 ? kilnPile : 0,
              stock: { stones, brick },
            });
            const after = live(before, seconds);
            const gained = {
              stones: after.mountain.stock.stones - stones,
              brick: after.mountain.stock.brick - brick,
            };
            const pile = after.mountain.piles.kiln - before.piles.kiln;
            // Every rock lifted is stone, brick or waiting at the kilns.
            expect(gained.stones + gained.brick + pile).toBe(after.mined);
            expect(gained.stones).toBeGreaterThanOrEqual(0);
            expect(gained.brick).toBeGreaterThanOrEqual(0);
            // A stockpile at or over its room gains nothing.
            for (const good of ["stones", "brick"] as const) {
              const room = stockpileRoom(before, good);
              if (before.stock[good] >= room) {
                expect(gained[good]).toBe(0);
              } else {
                expect(after.mountain.stock[good]).toBeLessThanOrEqual(room);
              }
            }
            // With room for all the stone, the line runs as fast as without a stockyard.
            const open = live({ ...before, operational: [] }, seconds);
            const room = stockpileRoom(before, "stones");
            if (stones + open.mined <= room) {
              expect(after.mined).toBe(open.mined);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});

describe("the night runs until the stockyard is full (#666)", () => {
  it("has no clock once the stockyard is open", () => {
    partTwo(() => {
      // 18 a second, 8.1 at 45%: twelve hours bring up 349,920.
      const away = night(works({}), 12 * HOUR);
      expect(away.mined).toBe(349_920);
      expect(away.report.paidMs).toBe(12 * HOUR);
      expect(away.report.capped).toBe(false);
      expect(away.report.night?.stop).toBe("none");
      expect(away.report.night?.producedMs).toBe(12 * HOUR);
    });
  });

  it("keeps the clock before the Light Tower", () => {
    partTwo(() => {
      const away = night(works({ operational: [] }), 12 * HOUR);
      expect(away.report.night?.stop).toBe("clock");
      expect(away.report.capped).toBe(true);
    });
  });

  it("stops when the stockyard is full, and says when each stockpile filled", () => {
    partTwo(() => {
      // 8.1 a second fills the 300,000 left in under eleven hours.
      const start = works({ stock: { stones: 2_700_000 } });
      const away = night(start, 20 * HOUR);
      expect(away.mountain.stock.stones).toBe(3_000_000);
      const facts = away.report.night;
      expect(facts?.stop).toBe("stockyard");
      const filled = Math.ceil(300_000 / 8.1) * 1000;
      expect(facts?.fullAtMs?.stones).toBeGreaterThanOrEqual(filled - 2000);
      expect(facts?.fullAtMs?.stones).toBeLessThanOrEqual(filled + 2000);
      expect(facts?.producedMs).toBeLessThan(20 * HOUR);
    });
  });

  it("goes on as fast as transport takes from a full stockpile", () => {
    partTwo(() => {
      const start = works({
        stock: { stones: 3_000_000 },
        driving: 1,
        building: 2,
        project: {
          kind: "delivering",
          site: {
            building: "warehouse",
            step: 0,
            arrived: EMPTY_STOCK,
            onSite: EMPTY_STOCK,
          },
        },
      });
      const away = night(start, 10 * HOUR);
      const facts = away.report.night;
      // One wagon at 45% takes 4.05 stone a second, and the mine makes it good.
      const took = facts?.delivered.stones ?? 0;
      expect(took).toBeGreaterThan(0.95 * 4.05 * 36_000);
      expect(away.mountain.stock.stones).toBeGreaterThanOrEqual(3_000_000 - 50);
      expect(away.mountain.stock.stones).toBeLessThanOrEqual(3_000_000 + 50);
      expect(away.mined).toBeGreaterThan(0.95 * took);
    });
  });

  it("opens the stockyard when the Light Tower's roof goes on at night, and the clock goes", () => {
    partTwo(() => {
      const start = works({
        operational: [],
        driving: 1,
        building: 2,
        stock: { stones: 2_000_000 },
        project: {
          kind: "delivering",
          site: {
            building: "lightTower",
            step: 2,
            arrived: { ...EMPTY_STOCK, stones: 999_000 },
            onSite: EMPTY_STOCK,
          },
        },
      });
      const away = night(start, 12 * HOUR);
      expect(away.mountain.operational).toEqual(["lightTower"]);
      expect(away.report.night?.stop).not.toBe("clock");
      // Drilling went past eight hours.
      expect(away.report.night?.producedMs).toBeGreaterThan(8 * HOUR + HOUR);
    });
  });
});

describe("a full stockpile with an order in hand (#666)", () => {
  /** The Warehouse's foundation with `stones` of its stone arrived, one wagon and two builders. */
  function ordered(setup: Setup, stones: number): Mountain {
    return works({
      driving: 1,
      building: 2,
      ...setup,
      project: {
        kind: "delivering",
        site: {
          building: "warehouse",
          step: 0,
          arrived: { ...EMPTY_STOCK, stones },
          onSite: EMPTY_STOCK,
        },
      },
    });
  }

  it("stops topping up the stone once the step needs no more stone", () => {
    partTwo(() => {
      // 1,000 stone still to bring, then brick only: the stone stockpile stays full.
      const start = ordered(
        { kilns: 1, kilnPile: 300, stock: { stones: 3_000_000, brick: 1_000 } },
        7_999_000,
      );
      const away = night(start, 10 * HOUR);
      expect(away.mountain.stock.stones).toBeLessThanOrEqual(3_000_000 + 20);
      const day = live(start, 3 * 3_600);
      expect(day.mountain.stock.stones).toBeLessThanOrEqual(3_000_000 + 20);
    });
  });

  it("never fills a stockpile far past its room, whatever transport takes", () => {
    partTwo(() => {
      fc.assert(
        fc.property(
          fc.nat(2),
          fc.integer({ min: 2_990_000, max: 3_000_000 }),
          fc.nat(600_000),
          fc.nat(8_000_000),
          // Short nights, and long ones, where one-second stretches would show.
          fc.oneof(fc.integer({ min: 1, max: 6 }), fc.constantFrom(24, 48, 72)),
          fc.boolean(),
          (kilns, stones, brick, arrived, hours, away) => {
            const start = ordered(
              {
                kilns,
                kilnPile: kilns > 0 ? 300 : 0,
                stock: { stones, brick },
              },
              arrived,
            );
            const after = away
              ? night(start, hours * HOUR).mountain
              : live(start, hours * 3_600).mountain;
            for (const good of ["stones", "brick"] as const) {
              const top = Math.max(
                start.stock[good],
                stockpileRoom(start, good),
              );
              // At most a second of the line's work over, from a stretch's last part-second.
              expect(after.stock[good]).toBeLessThanOrEqual(top + 20);
            }
          },
        ),
        { numRuns: 40 },
      );
    });
  });
});

describe("the Warehouse (#666)", () => {
  it("is the next building after the Light Tower in part 2, and none in part 1", () => {
    partTwo(() => {
      expect(nextBuilding({ operational: ["lightTower"] })?.id).toBe(
        "warehouse",
      );
      expect(nextBuilding({ operational: [] })?.id).toBe("lightTower");
    });
    partOne(() => {
      expect(nextBuilding({ operational: ["lightTower"] })).toBeUndefined();
    });
  });

  it("requires stone and brick, and transport carries both", () => {
    partTwo(() => {
      const ordered = placeOrder(
        works({
          line: 0,
          driving: 1,
          building: 2,
          stock: { stones: 1_000, brick: 1_000 },
        }),
      );
      expect(ordered.project).toMatchObject({
        kind: "delivering",
        site: { building: "warehouse", step: 0 },
      });
      const after = live(ordered, 100);
      expect(after.mountain.stock.stones).toBeLessThan(1_000);
      expect(after.mountain.stock.brick).toBeLessThan(1_000);
    });
  });

  it("doubles the stockyard's room when its roof is on", () => {
    partTwo(() => {
      const built = works({ operational: ["lightTower", "warehouse"] });
      expect(stockpileRoom(built, "stones")).toBe(6_000_000);
      expect(stockpileRoom(built, "brick")).toBe(1_000_000);
    });
  });
});

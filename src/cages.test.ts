import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  NO_CAGES,
  NO_HOISTS_ASSIGNED,
  assignHoists,
  cageAt,
  cageKeys,
  cagePileRoom,
  cageRates,
  carriedBy,
  hoistsOwned,
  largestLoad,
  legSeconds,
  restoredTrips,
  shaftCages,
  tripSeconds,
  unassignHoists,
  unassignedHoists,
  type CageKey,
  type HoistsAssigned,
  type ShaftCage,
} from "./cages";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { MINE_LEVEL_IDS, sinkShaft } from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { effectiveRates } from "./rates";
import { tierRecord, type MachineId, type TierId } from "./tiers";
import { toolSpeed, type StageWork } from "./workforce";

/**
 * The shaft's cages (slice 1, rules 5.5 to 5.14, #724): every hoist and
 * engine he owns and the winch, what each carries a trip, which level it
 * serves, and what they lift a second when counted as rates.
 */
const partThree = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);

const speed = partThree(() => effectiveRates(createMountain()).tierSpeed);

/** Hoisting's work: these machines running and these workers on tools. */
function work(
  running: Partial<Record<MachineId, number>>,
  tools = 0,
): StageWork {
  return { running, tools, moves: 0, short: 0 };
}

type Input = Parameters<typeof shaftCages>[0];

/** The shaft's cages for these owned tiers and this work, one level open. */
function cagesOf(
  owned: Partial<Record<TierId, number>>,
  hoisting: StageWork,
  more: Partial<Omit<Input, "owned" | "hoisting">> = {},
): readonly ShaftCage[] {
  const assigned: HoistsAssigned = more.assigned ?? NO_HOISTS_ASSIGNED;
  return shaftCages({
    owned: { ...tierRecord(0), ...owned },
    hoisting,
    speed,
    assigned,
    twoLevels: more.twoLevels ?? false,
    pay: more.pay ?? 1,
  });
}

/** Each cage's key to what it serves. */
function servesOf(cages: readonly ShaftCage[]): Record<string, string> {
  return Object.fromEntries(cages.map((cage) => [cage.key, cage.serves]));
}

describe("the cages' trips (Starting numbers, call 71)", () => {
  it("takes 10 s to the Topsoil and back and 20 s to the Granite, for every cage", () => {
    expect(tripSeconds("topsoil")).toBe(10);
    expect(tripSeconds("granite")).toBe(20);
    expect([
      legSeconds("topsoil", "down"),
      legSeconds("topsoil", "up"),
    ]).toEqual([5, 5]);
    expect([
      legSeconds("granite", "down"),
      legSeconds("granite", "up"),
    ]).toEqual([10, 10]);
  });

  it("scales a trip by its knob, in whole seconds, never under 2", () => {
    withFactors({ "trip.granite": 0.55 }, () => {
      expect(tripSeconds("granite")).toBe(11);
      expect([
        legSeconds("granite", "down"),
        legSeconds("granite", "up"),
      ]).toEqual([5, 6]);
      // The Topsoil's trip has its own knob.
      expect(tripSeconds("topsoil")).toBe(10);
    });
    withFactors({ "trip.topsoil": 0 }, () => {
      expect(tripSeconds("topsoil")).toBe(2);
      expect([
        legSeconds("topsoil", "down"),
        legSeconds("topsoil", "up"),
      ]).toEqual([1, 1]);
    });
  });
});

describe("which cages the shaft has (rules 5.5, 5.8, 5.10, call 70)", () => {
  it("is every engine, then every hoist, then the winch, keyed so a new hoist moves no other", () => {
    expect(cageKeys({ ...tierRecord(0), hoist: 2, machine: 1 })).toEqual([
      "machine:0",
      "hoist:0",
      "hoist:1",
      "winch",
    ]);
    expect(cageKeys({ ...tierRecord(0), hoist: 3, machine: 1 })).toEqual([
      "machine:0",
      "hoist:0",
      "hoist:1",
      "hoist:2",
      "winch",
    ]);
    expect(cageKeys(tierRecord(0))).toEqual(["winch"]);
  });

  it("counts the hoists he owns: every hoist and every engine", () => {
    expect(hoistsOwned({ ...tierRecord(0), hoist: 3, machine: 2 })).toBe(5);
    expect(hoistsOwned({ ...tierRecord(0), helper: 9, cart: 4 })).toBe(0);
  });

  it("loads a hoist with its rating times the Topsoil's trip", () => {
    expect(speed.hoist).toBe(60);
    expect(cagesOf({ hoist: 1 }, work({ hoist: 1 }))).toEqual([
      { key: "hoist:0", load: 600, runs: true, serves: "topsoil" },
      { key: "winch", load: 0, runs: false, serves: "topsoil" },
    ]);
    // The trip that sets the load is the Topsoil's, whichever level it serves.
    withFactors(
      {
        [FRESH_OFF]: 0,
        [PART_TWO_OFF]: 0,
        [PART_THREE_OFF]: 0,
        "trip.topsoil": 2,
      },
      () => {
        expect(cagesOf({ hoist: 1 }, work({ hoist: 1 }))[0]?.load).toBe(
          speed.hoist * 20,
        );
      },
    );
  });

  it("loads an engine by its own rating (call 71)", () => {
    const [engine] = cagesOf({ machine: 1 }, work({ machine: 1 }));
    expect(engine?.key).toBe("machine:0");
    expect(engine?.load).toBe(speed.machine * 10);
    expect(engine?.load).toBeGreaterThan(speed.hoist * 10);
    expect(engine?.runs).toBe(true);
  });

  it("loads the winch with its workers' tools, never more than a hoist's load", () => {
    const winch = (tools: number, owned = {}) =>
      cagesOf(owned, work({}, tools)).find((cage) => cage.key === "winch");
    expect(toolSpeed(speed)).toBe(3);
    expect(winch(2)).toEqual({
      key: "winch",
      load: 2 * toolSpeed(speed) * 10,
      runs: true,
      serves: "topsoil",
    });
    expect(winch(40)?.load).toBe(speed.hoist * 10);
    expect(winch(40, { hoist: 2 })?.load).toBe(speed.hoist * 10);
    expect(winch(0)).toEqual({
      key: "winch",
      load: 0,
      runs: false,
      serves: "topsoil",
    });
  });

  it("runs the first of each kind that hoisting's workers run", () => {
    const cages = cagesOf(
      { hoist: 3, machine: 2 },
      work({ hoist: 1, machine: 1 }, 1),
    );
    expect(cages.map((cage) => [cage.key, cage.runs])).toEqual([
      ["machine:0", true],
      ["machine:1", false],
      ["hoist:0", true],
      ["hoist:1", false],
      ["hoist:2", false],
      ["winch", true],
    ]);
    // A cage that does not run still has its load.
    expect(cages[4]?.load).toBe(speed.hoist * 10);
    // An engine out of play is not in hoisting's work: it does not run.
    expect(cagesOf({ machine: 1 }, work({ hoist: 0 }))[0]?.runs).toBe(false);
  });

  it("gives the engines the assigned places first, the Topsoil's before the Granite's", () => {
    const owned = { machine: 1, hoist: 2 };
    const hoisting = work({ hoist: 2, machine: 1 }, 1);
    expect(
      servesOf(
        cagesOf(owned, hoisting, {
          assigned: { topsoil: 1, granite: 1 },
          twoLevels: true,
        }),
      ),
    ).toEqual({
      "machine:0": "topsoil",
      "hoist:0": "granite",
      "hoist:1": "both",
      winch: "both",
    });
    expect(
      servesOf(
        cagesOf(owned, hoisting, {
          assigned: { topsoil: 0, granite: 2 },
          twoLevels: true,
        }),
      ),
    ).toEqual({
      "machine:0": "granite",
      "hoist:0": "granite",
      "hoist:1": "both",
      winch: "both",
    });
    // With none assigned every cage serves both, and so does the winch with all assigned.
    expect(servesOf(cagesOf(owned, hoisting, { twoLevels: true }))).toEqual({
      "machine:0": "both",
      "hoist:0": "both",
      "hoist:1": "both",
      winch: "both",
    });
    expect(
      servesOf(
        cagesOf(owned, hoisting, {
          assigned: { topsoil: 2, granite: 1 },
          twoLevels: true,
        }),
      ),
    ).toEqual({
      "machine:0": "topsoil",
      "hoist:0": "topsoil",
      "hoist:1": "granite",
      winch: "both",
    });
    // A cage that does not run still holds its place.
    const idle = cagesOf(owned, work({ hoist: 0 }), {
      assigned: { topsoil: 1, granite: 1 },
      twoLevels: true,
    });
    expect(servesOf(idle)).toEqual({
      "machine:0": "topsoil",
      "hoist:0": "granite",
      "hoist:1": "both",
      winch: "both",
    });
  });

  it("keeps the winch for both even with more assigned than he owns, a state no move makes", () => {
    const cages = cagesOf({ hoist: 1 }, work({ hoist: 1 }, 1), {
      assigned: { topsoil: 3, granite: 2 },
      twoLevels: true,
    });
    expect(servesOf(cages)).toEqual({ "hoist:0": "topsoil", winch: "both" });
  });

  it("keeps each key's kind and place, an engine's and a hoist's past nine", () => {
    const cages = cagesOf(
      { machine: 11, hoist: 11 },
      work({ machine: 10, hoist: 11 }),
    );
    const runs = Object.fromEntries(cages.map((cage) => [cage.key, cage.runs]));
    expect(runs["machine:9"]).toBe(true);
    expect(runs["machine:10"]).toBe(false);
    expect(runs["hoist:10"]).toBe(true);
    expect(cages.find((cage) => cage.key === "machine:0")?.load).toBe(
      speed.machine * 10,
    );
  });

  it("serves the Topsoil with every cage while one level is open, whatever is assigned", () => {
    const cages = cagesOf(
      { machine: 1, hoist: 2 },
      work({ hoist: 2, machine: 1 }, 1),
      { assigned: { topsoil: 1, granite: 2 }, twoLevels: false },
    );
    expect(cages.map((cage) => cage.serves)).toEqual([
      "topsoil",
      "topsoil",
      "topsoil",
      "topsoil",
    ]);
  });

  it("scales every load by pay", () => {
    const owned = { machine: 1, hoist: 1 };
    const hoisting = work({ hoist: 1, machine: 1 }, 2);
    const once = cagesOf(owned, hoisting);
    const twice = cagesOf(owned, hoisting, { pay: 2.5 });
    expect(twice.map((cage) => cage.load)).toEqual(
      once.map((cage) => cage.load * 2.5),
    );
    expect(once.map((cage) => cage.load)).toEqual([
      speed.machine * 10,
      speed.hoist * 10,
      2 * toolSpeed(speed) * 10,
    ]);
    expect(twice.map((cage) => cage.runs)).toEqual(
      once.map((cage) => cage.runs),
    );
  });
});

describe("the cages as rates (rule 5.14)", () => {
  const cage = (
    key: ShaftCage["key"],
    serves: ShaftCage["serves"],
    load = 600,
    runs = true,
  ): ShaftCage => ({ key, load, runs, serves });

  it("lifts a load in one level's trip for a cage with one level, and two loads in both trips for one for both", () => {
    expect(
      cageRates([cage("hoist:0", "granite"), cage("hoist:1", "both")]),
    ).toEqual({ own: { topsoil: 0, granite: 30 }, loads: 600 });
    expect(
      cageRates([
        cage("machine:0", "topsoil", 63_000),
        cage("hoist:0", "granite"),
        cage("hoist:1", "both"),
        cage("winch", "both", 60),
      ]),
    ).toEqual({ own: { topsoil: 6_300, granite: 30 }, loads: 660 });
  });

  it("is the hoists' ratings with the Topsoil alone", () => {
    const rates = cageRates(cagesOf({ hoist: 2 }, work({ hoist: 2 })));
    expect(rates.own.topsoil).toBe(2 * speed.hoist);
    expect(rates.own.granite).toBe(0);
    expect(rates.loads).toBe(0);
  });

  it("counts no cage that does not run", () => {
    expect(
      cageRates([
        cage("hoist:0", "topsoil", 600, false),
        cage("hoist:1", "granite", 600, false),
        cage("winch", "both", 30, false),
      ]),
    ).toEqual({ own: { topsoil: 0, granite: 0 }, loads: 0 });
    expect(
      cageRates([
        cage("hoist:0", "topsoil", 600, false),
        cage("hoist:1", "topsoil"),
      ]),
    ).toEqual({ own: { topsoil: 60, granite: 0 }, loads: 0 });
  });
});

describe("the piles the cages use (Starting numbers)", () => {
  const loaded = (key: CageKey, load: number): ShaftCage => ({
    key,
    load,
    runs: true,
    serves: "both",
  });

  it("hold three loads of the largest cage with three cages or fewer, never less than 300", () => {
    expect(cagePileRoom(300, [])).toBe(300);
    expect(cagePileRoom(300, [loaded("winch", 90)])).toBe(300);
    expect(
      cagePileRoom(300, [loaded("hoist:0", 600), loaded("winch", 0)]),
    ).toBe(1_800);
    expect(cagePileRoom(300, [loaded("winch", 100.2)])).toBe(301);
    withFactors({ "piles.loads": 0.5 }, () => {
      expect(cagePileRoom(300, [loaded("hoist:0", 600)])).toBe(900);
    });
  });

  it("hold a load of the largest cage for every cage past three, so cages that arrive together each find one (Task 7)", () => {
    const seven = [
      ...Array.from({ length: 6 }, (_, index) =>
        loaded(`hoist:${String(index)}` as CageKey, 600),
      ),
      loaded("winch", 360),
    ];
    expect(cagePileRoom(300, seven)).toBe(7 * 600);
    withFactors({ "piles.loads": 0.5 }, () => {
      expect(cagePileRoom(300, seven)).toBe(2_100);
    });
  });

  it("takes the largest load of any cage, the winch's among them (rule 5.10)", () => {
    expect(largestLoad([])).toBe(0);
    // With no hoist the winch's cage sets the room: a shaft of 300 would fill during its trip.
    expect(largestLoad([loaded("winch", 600)])).toBe(600);
    const cages = cagesOf({ machine: 1, hoist: 2 }, work({ hoist: 0 }, 40));
    // Owned, not running, still counts: the piles follow what he owns.
    expect(largestLoad(cages)).toBe(speed.machine * 10);
    expect(largestLoad(cagesOf({ hoist: 1 }, work({}, 40)))).toBe(
      speed.hoist * 10,
    );
  });
});

/** A mine with the shaft sunk and paid for, owning these tiers, in part 3. */
function sunkMine(owned: Partial<Record<TierId, number>> = {}): Mountain {
  return partThree(() => {
    const fresh = createMountain();
    const sunk = sinkShaft({
      ...fresh,
      operational: ["lightTower"],
      stock: { ...fresh.stock, stones: 10_000_000, brick: 1_500_000 },
    });
    expect(sunk.granite.kind).toBe("sunk");
    return { ...sunk, owned: { ...sunk.owned, ...owned } };
  });
}

const partTwo = <T>(body: () => T): T =>
  withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

describe("hoists assigned to a level (rule 5.8)", () => {
  it("assigns up to the hoists he owns that are not assigned, free and at once", () => {
    partThree(() => {
      const mine = sunkMine({ hoist: 2 });
      expect(unassignedHoists(mine)).toBe(2);
      const after = assignHoists(mine, "granite", 5);
      expect(after.cages.assigned).toEqual({ topsoil: 0, granite: 2 });
      expect(after.stock).toEqual(mine.stock);
      expect(after.cages.trips).toBe(mine.cages.trips);
      expect(unassignedHoists(after)).toBe(0);
      // None left to assign: the same object.
      expect(assignHoists(after, "topsoil")).toBe(after);
      const one = assignHoists(mine, "topsoil");
      expect(one.cages.assigned).toEqual({ topsoil: 1, granite: 0 });
      expect(assignHoists(one, "granite").cages.assigned).toEqual({
        topsoil: 1,
        granite: 1,
      });
    });
  });

  it("counts a winding engine as a hoist (call 70)", () => {
    partThree(() => {
      const mine = sunkMine({ hoist: 1, machine: 1 });
      expect(unassignedHoists(mine)).toBe(2);
      expect(assignHoists(mine, "topsoil", 3).cages.assigned.topsoil).toBe(2);
    });
  });

  it("reads a count as a worker move does: whole, NaN none, Infinity all", () => {
    partThree(() => {
      const mine = sunkMine({ hoist: 3 });
      expect(assignHoists(mine, "granite", Number.NaN)).toBe(mine);
      expect(assignHoists(mine, "granite", 0)).toBe(mine);
      expect(assignHoists(mine, "granite", -1)).toBe(mine);
      expect(assignHoists(mine, "granite", 1.9).cages.assigned.granite).toBe(1);
      const all = assignHoists(mine, "granite", Infinity);
      expect(all.cages.assigned.granite).toBe(3);
      expect(unassignHoists(all, "granite", Number.NaN)).toBe(all);
      expect(unassignHoists(all, "granite", 2.5).cages.assigned.granite).toBe(
        1,
      );
      expect(
        unassignHoists(all, "granite", Infinity).cages.assigned.granite,
      ).toBe(0);
      // Nothing on the level: the same object.
      expect(unassignHoists(all, "topsoil")).toBe(all);
    });
  });

  it("assigns nothing while the Granite is shut, and takes off at any time: no lock", () => {
    partThree(() => {
      const unsunk = {
        ...createMountain(),
        owned: { ...tierRecord(0), hoist: 2 },
      };
      expect(unassignedHoists(unsunk)).toBe(2);
      expect(assignHoists(unsunk, "granite")).toBe(unsunk);
      expect(assignHoists(unsunk, "topsoil")).toBe(unsunk);
    });
    const held = partThree(() =>
      assignHoists(sunkMine({ hoist: 2 }), "granite"),
    );
    expect(held.cages.assigned.granite).toBe(1);
    partTwo(() => {
      expect(assignHoists(held, "granite")).toBe(held);
      expect(unassignHoists(held, "granite").cages.assigned.granite).toBe(0);
    });
  });

  it("never assigns more than he owns, whatever the moves (property)", () => {
    const base = sunkMine();
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            level: fc.constantFrom(...MINE_LEVEL_IDS),
            count: fc.integer({ min: -2, max: 4 }),
            on: fc.boolean(),
          }),
        ),
        fc.integer({ min: 0, max: 6 }),
        (moves, hoists) => {
          partThree(() => {
            let mine: Mountain = {
              ...base,
              owned: { ...base.owned, hoist: hoists },
            };
            for (const move of moves) {
              mine = move.on
                ? assignHoists(mine, move.level, move.count)
                : unassignHoists(mine, move.level, move.count);
              const { topsoil, granite } = mine.cages.assigned;
              expect(topsoil).toBeGreaterThanOrEqual(0);
              expect(granite).toBeGreaterThanOrEqual(0);
              expect(topsoil + granite).toBeLessThanOrEqual(
                hoistsOwned(mine.owned),
              );
              expect(unassignedHoists(mine)).toBe(
                hoistsOwned(mine.owned) - topsoil - granite,
              );
            }
          });
        },
      ),
    );
  });
});

describe("what the cages carry (call 63)", () => {
  it("adds what every cage carries, level by level", () => {
    expect(carriedBy({})).toEqual({ topsoil: 0, granite: 0 });
    expect(
      carriedBy({
        "hoist:0": { level: "topsoil", carried: 400, leg: { kind: "top" } },
        "hoist:1": {
          level: "granite",
          carried: 120,
          leg: { kind: "up", left: 4 },
        },
        "machine:0": {
          level: "topsoil",
          carried: 30,
          leg: { kind: "down", left: 2 },
        },
        winch: { level: "granite", carried: 7, leg: { kind: "loading" } },
      }),
    ).toEqual({ topsoil: 430, granite: 127 });
  });

  it("puts each level's carried rock in a cage at the top, the Topsoil's first", () => {
    expect(
      restoredTrips({ topsoil: 400, granite: 120 }, ["hoist:0", "winch"]),
    ).toEqual({
      "hoist:0": { level: "topsoil", carried: 400, leg: { kind: "top" } },
      winch: { level: "granite", carried: 120, leg: { kind: "top" } },
    });
    expect(
      restoredTrips({ topsoil: 0, granite: 120 }, ["hoist:0", "winch"]),
    ).toEqual({
      "hoist:0": { level: "granite", carried: 120, leg: { kind: "top" } },
    });
    expect(restoredTrips({ topsoil: 0, granite: 0 }, ["winch"])).toEqual({});
    expect(restoredTrips({ topsoil: 5, granite: 0 }, ["winch"])).toEqual({
      winch: { level: "topsoil", carried: 5, leg: { kind: "top" } },
    });
    // The reader refuses this save first: only the winch's cage for both levels' rock.
    expect(() =>
      restoredTrips({ topsoil: 5, granite: 5 }, ["winch"]),
    ).toThrow();
  });

  it("carries back what it restored", () => {
    const carried = { topsoil: 400, granite: 120 };
    expect(carriedBy(restoredTrips(carried, ["hoist:0", "winch"]))).toEqual(
      carried,
    );
  });

  it("starts a fresh cage empty at the top, on alternate levels by its place", () => {
    expect(cageAt({}, "hoist:0", 0)).toEqual({
      level: "granite",
      carried: 0,
      leg: { kind: "top" },
    });
    expect(cageAt({}, "hoist:1", 1).level).toBe("topsoil");
    expect(cageAt({}, "winch", 2).level).toBe("granite");
    const held = {
      level: "topsoil",
      carried: 9,
      leg: { kind: "loading" },
    } as const;
    expect(cageAt({ "hoist:0": held }, "hoist:0", 0)).toBe(held);
  });

  it("starts every fresh mine with none assigned and nothing carried", () => {
    expect(createMountain().cages).toEqual(NO_CAGES);
    expect(NO_CAGES).toEqual({ assigned: NO_HOISTS_ASSIGNED, trips: {} });
  });
});

import { describe, expect, it } from "vitest";
import {
  NO_HOISTS_ASSIGNED,
  cageKeys,
  cagePileRoom,
  cageRates,
  hoistsOwned,
  largestLoad,
  legSeconds,
  shaftCages,
  tripSeconds,
  type HoistsAssigned,
  type ShaftCage,
} from "./cages";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain } from "./mountain";
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
  it("hold three loads of the largest hoist or engine he owns, never less than 300", () => {
    expect(cagePileRoom(300, 0)).toBe(300);
    expect(cagePileRoom(300, 90)).toBe(300);
    expect(cagePileRoom(300, 600)).toBe(1_800);
    expect(cagePileRoom(300, 100.2)).toBe(301);
    withFactors({ "piles.loads": 0.5 }, () => {
      expect(cagePileRoom(300, 600)).toBe(900);
    });
  });

  it("takes the largest load of a hoist or engine, never the winch's", () => {
    expect(largestLoad([])).toBe(0);
    expect(
      largestLoad([{ key: "winch", load: 600, runs: true, serves: "both" }]),
    ).toBe(0);
    const cages = cagesOf({ machine: 1, hoist: 2 }, work({ hoist: 0 }, 40));
    // Owned, not running, still counts: the piles follow what he owns.
    expect(largestLoad(cages)).toBe(speed.machine * 10);
    expect(largestLoad(cagesOf({ hoist: 1 }, work({}, 40)))).toBe(
      speed.hoist * 10,
    );
  });
});

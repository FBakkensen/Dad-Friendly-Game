import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { TENDING_GAIN, TENDING_TENTHS, station } from "./engineers";
import type { Trouble } from "./hazards";
import { milestoneMultiplier } from "./milestones";
import { holdForRush, startRush } from "./gold-rush";
import {
  AWAY_PAY_RATE,
  effectiveRates,
  firstIdleTier,
  handsGain,
  moveGain,
  startedTier,
  tendingGain,
} from "./rates";
import { send } from "./expeditions";
import { handsSpeed, lineOf, lineRating, lineSpeed, stageSpeeds } from "./line";
import { minedMountain, patched, type MountainPatch } from "./test-fixtures";
import { TIERS } from "./tiers";
import { NO_BOOSTS } from "./boosts";
import { NO_UPGRADES } from "./upgrades";

describe("effectiveRates", () => {
  it("reads one mountain once when no clock is passed", () => {
    const mountain = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 3, cart: 1, kid: 0 },
    };
    const first = effectiveRates(mountain);
    expect(effectiveRates(mountain)).toBe(first);
    expect(effectiveRates({ ...mountain })).not.toBe(first);
    expect(effectiveRates({ ...mountain })).toEqual(first);
  });

  it("reads the same mountain again under a sweep, then puts it back", () => {
    const mountain = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 3, cart: 1, kid: 0 },
    };
    const plain = effectiveRates(mountain);
    withFactors({ "output.cart": 2 }, () => {
      expect(effectiveRates(mountain).tierSpeed.cart).toBe(
        plain.tierSpeed.cart * 2,
      );
    });
    expect(effectiveRates(mountain).tierSpeed.cart).toBe(plain.tierSpeed.cart);
  });

  it("is the plain table with no upgrades: taps 1, tiers at list speed", () => {
    const rates = effectiveRates({
      ...minedMountain(0),
      // 11 of 12 workers staff the cart (1) and the Great Machine (10).
      owned: {
        ...minedMountain(0).owned,
        helper: 12,
        cart: 1,
        machine: 1,
        kid: 0,
      },
    });
    expect(rates.tapYield).toBe(1);
    // Machines at the line's rating, three times their list speed (#536).
    expect(rates.tierSpeed).toEqual(
      Object.fromEntries(
        TIERS.map((tier) => [tier.id, tier.perSecond * lineRating(tier.id)]),
      ),
    );
    // The hands lift the empty face to the cart's 18, then both together.
    expect(rates.crewPerSecond).toBe((3 * 12 + 18) / 2);
    expect(rates.exactCrewPerSecond).toBe(rates.crewPerSecond);
    expect(rates.awayPay).toBe(AWAY_PAY_RATE);
  });

  it("keeps the fraction the crew line floors away", () => {
    const rates = effectiveRates({
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 11, kid: 0 },
      upgrades: { ...NO_UPGRADES, boots: 1 },
    });
    expect(rates.exactCrewPerSecond).toBeCloseTo(11 * 2.36, 10);
    expect(rates.crewPerSecond).toBe(25);
  });

  it("slows the troubled tier from a quarter toward a half, and not the others", () => {
    const crew = {
      ...minedMountain(0),
      owned: {
        ...minedMountain(0).owned,
        helper: 9,
        cart: 1,
        borer: 1,
        kid: 0,
      },
    };
    const trouble: Trouble = { kind: "cave-in", tier: "cart", startedAt: 0 };
    const plain = effectiveRates(crew, 0);
    const started = effectiveRates(crew, 0, trouble);
    // The empty lift and the cart's haul share the 9 hands' 27 (#536).
    expect(plain.crewPerSecond).toBe(Math.floor((27 + 18) / 2));
    expect(started.tierSpeed.cart).toBe(13.5);
    expect(started.tierSpeed.borer).toBe(plain.tierSpeed.borer);
    expect(started.awayPay).toBe(plain.awayPay);
    expect(started.crewPerSecond).toBe(Math.floor((27 + 13.5) / 2));
    expect(effectiveRates(crew, 60_000, trouble).tierSpeed.cart).toBe(11.25);
    expect(effectiveRates(crew, 120_000, trouble).tierSpeed.cart).toBe(9);
    expect(effectiveRates(crew, 180_000, trouble).tierSpeed.cart).toBe(9);
    expect(effectiveRates(crew, undefined, trouble).tierSpeed.cart).toBe(13.5);
  });

  it("Grandfather's pick makes taps a little stronger and leaves the crew alone", () => {
    const crew = {
      ...minedMountain(0),
      owned: {
        ...minedMountain(0).owned,
        helper: 9,
        cart: 1,
        borer: 1,
        kid: 0,
      },
    };
    const plain = effectiveRates(crew);
    const picked = effectiveRates({ ...crew, finds: ["pick"] });
    expect(picked.tapYield).toBeGreaterThan(plain.tapYield);
    expect(picked.tapYield).toBe(Math.ceil(plain.tapYield * 1.25));
    expect(picked.crewPerSecond).toBe(plain.crewPerSecond);
    expect(picked.tierSpeed).toEqual(plain.tierSpeed);
    expect(picked.awayPay).toBe(plain.awayPay);
    expect(
      effectiveRates({ ...crew, finds: ["lamp", "map", "boots"] }).tapYield,
    ).toBe(plain.tapYield);
  });
});

/**
 * A pit train and a Great Machine and the eighteen hands that run them: the
 * haul (3,201) and the lift (6,300) outrun a face of a borer or two, so the
 * face holds the line and a tender on it lifts the line (#536).
 */
const FACE_HOLDS = { train: 1, machine: 1 } as const;
const FACE_HOLDS_HANDS = 18;

describe("tendingGain", () => {
  const ada = {
    name: "Ada" as const,
    rank: 0 as const,
    trips: 0,
    post: "camp" as const,
  };

  it("is the staffed stones a second her tending adds, from effectiveRates", () => {
    const idle = {
      ...minedMountain(0),
      owned: {
        ...minedMountain(0).owned,
        ...FACE_HOLDS,
        helper: 8 + FACE_HOLDS_HANDS,
        borer: 1,
      },
      engineers: [{ ...ada, post: "borer" as const }],
    };
    const unstaffed = { ...idle, owned: { ...idle.owned, helper: 0 } };
    expect(tendingGain(unstaffed, 0, "borer")).toBe(0);
    const staffed = idle;
    const atCamp = station(staffed, 0, "camp");
    const onBorer = station(staffed, 0, "borer");
    expect(tendingGain(staffed, 0, "borer")).toBe(
      effectiveRates(onBorer).crewPerSecond -
        effectiveRates(atCamp).crewPerSecond,
    );
    // A rank-0 tender's 21.875% of the borer's 1,071.
    const each = Math.floor(1_071 * 0.21875);
    expect(tendingGain(staffed, 0, "borer")).toBe(each);
    const two = {
      ...staffed,
      owned: { ...staffed.owned, helper: 16 + FACE_HOLDS_HANDS, borer: 2 },
    };
    expect(tendingGain(two, 0, "borer")).toBe(2 * each);
    expect(tendingGain(staffed, 9, "borer")).toBe(0);
  });

  it("prices a post the same while she is out on a trip: the tap calls her back (#415)", () => {
    const home = {
      ...minedMountain(0),
      owned: {
        ...minedMountain(0).owned,
        ...FACE_HOLDS,
        helper: 40,
        borer: 2,
      },
      engineers: [ada],
    };
    const away = send(home, 0, "side-seam", 0);
    expect(away.expeditions).toHaveLength(1);
    expect(tendingGain(home, 0, "borer")).toBeGreaterThan(0);
    expect(tendingGain(away, 0, "borer")).toBe(tendingGain(home, 0, "borer"));
    expect(moveGain(away, 0, "borer")).toBe(moveGain(home, 0, "borer"));
  });

  it("counts a Great Machine she starts, and not a rank already covered", () => {
    const waiting = {
      ...minedMountain(0),
      // A borer and a train run on sixteen; five more run the machine
      // only with Ada there.
      owned: {
        ...minedMountain(0).owned,
        helper: 21,
        borer: 1,
        train: 1,
        machine: 1,
      },
      engineers: [ada],
    };
    const tended = station(waiting, 0, "machine");
    expect(tendingGain(waiting, 0, "machine")).toBe(
      effectiveRates(tended).crewPerSecond -
        effectiveRates(station(waiting, 0, "camp")).crewPerSecond,
    );
    // Starting it lifts the empty stage: about a borer's 1,071, far more
    // than her tenth of a running machine would.
    expect(tendingGain(waiting, 0, "machine")).toBeGreaterThan(1_000);
    const covered = {
      ...waiting,
      owned: { ...waiting.owned, helper: 26 },
      engineers: [
        { ...ada, post: "borer" as const },
        {
          name: "Nils" as const,
          rank: 0 as const,
          trips: 0,
          post: "camp" as const,
        },
      ],
    };
    expect(tendingGain(covered, 1, "borer")).toBe(0);
    const journeyman = {
      ...covered,
      engineers: [
        { ...ada, post: "borer" as const },
        {
          name: "Nils" as const,
          rank: 1 as const,
          trips: 3,
          post: "camp" as const,
        },
      ],
    };
    // A journeyman's second tenth over Ada's first, on the borer's 1,071.
    expect(tendingGain(journeyman, 1, "borer")).toBe(
      Math.floor(1_071 * 0.21875),
    );
  });

  it("counts a second post's tenth once, not again on the floor's post (#349)", () => {
    // Ada's borer is the small tier, so the floor branch runs. Nils on the
    // carts adds his tier's tenth and his own floor, nothing more.
    const crew = {
      ...minedMountain(0),
      owned: {
        ...minedMountain(0).owned,
        helper: 40,
        cart: 4,
        drill: 2,
        borer: 1,
        machine: 1,
      },
      engineers: [{ ...ada, post: "borer" as const }],
    };
    const pair = {
      ...crew,
      engineers: [
        { ...ada, post: "borer" as const },
        {
          name: "Nils" as const,
          rank: 0 as const,
          trips: 0,
          post: "cart" as const,
        },
      ],
    };
    const plain = effectiveRates({
      ...crew,
      engineers: [{ ...ada, post: "camp" as const }],
    });
    const plainTotal = plain.exactCrewPerSecond;
    const tenth = (TENDING_TENTHS[0] * TENDING_GAIN) / 10;
    const cartRaise = plain.running.cart * plain.tierSpeed.cart * tenth;
    const nilsFloor = (plainTotal * 12 * TENDING_GAIN) / 100;
    expect(
      effectiveRates(pair).exactCrewPerSecond -
        effectiveRates(crew).exactCrewPerSecond,
    ).toBeCloseTo(cartRaise + nilsFloor, 6);
  });

  it("lifts an apprentice to 9% of the crew when her tier is the small one", () => {
    // The machine dwarfs one borer, so +10% of the borer is under 9%. The
    // face (two drills and the borer) holds the line, so her floor lifts it.
    const crew = {
      ...minedMountain(0),
      owned: {
        ...minedMountain(0).owned,
        ...FACE_HOLDS,
        helper: 40,
        drill: 2,
        borer: 1,
      },
      engineers: [{ ...ada, post: "borer" as const }],
    };
    const rested = effectiveRates(station(crew, 0, "camp"));
    const tended = effectiveRates(crew);
    const share =
      (tended.exactCrewPerSecond - rested.exactCrewPerSecond) /
      tended.exactCrewPerSecond;
    expect(share).toBeGreaterThanOrEqual(0.08);
    expect(tendingGain(crew, 0, "borer")).toBe(
      tended.crewPerSecond - rested.crewPerSecond,
    );
    // A second post keeps its own tenth on top of that floor.
    const pair = {
      ...crew,
      engineers: [
        { ...ada, post: "borer" as const },
        {
          name: "Nils" as const,
          rank: 0 as const,
          trips: 0,
          post: "drill" as const,
        },
      ],
    };
    expect(tendingGain(pair, 1, "drill")).toBeGreaterThan(0);
    // The higher rank is the floor, even on the smaller post.
    const masterOnDrill = {
      ...crew,
      engineers: [
        { ...ada, post: "borer" as const },
        {
          name: "Nils" as const,
          rank: 2 as const,
          trips: 9,
          post: "drill" as const,
        },
      ],
    };
    expect(effectiveRates(masterOnDrill).exactCrewPerSecond).toBeGreaterThan(
      effectiveRates(pair).exactCrewPerSecond,
    );
    // Same rank: the bigger machine sets the floor. A lower rank does not.
    const borerSecond = {
      ...crew,
      engineers: [
        { ...ada, post: "drill" as const },
        {
          name: "Nils" as const,
          rank: 0 as const,
          trips: 0,
          post: "borer" as const,
        },
      ],
    };
    const masterFirst = {
      ...crew,
      engineers: [
        {
          name: "Nils" as const,
          rank: 2 as const,
          trips: 9,
          post: "drill" as const,
        },
        { ...ada, post: "borer" as const },
      ],
    };
    expect(effectiveRates(borerSecond).exactCrewPerSecond).toBeGreaterThan(
      rested.exactCrewPerSecond,
    );
    expect(effectiveRates(masterFirst).exactCrewPerSecond).toBe(
      effectiveRates(masterOnDrill).exactCrewPerSecond,
    );
  });

  it("an old save with 30 drills mines x4 at once", () => {
    const old = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 40, drill: 30 },
    };
    const few = { ...old, owned: { ...old.owned, drill: 9 } };
    expect(milestoneMultiplier("drill", 30)).toBe(4);
    const drill = TIERS.find((tier) => tier.id === "drill");
    expect(drill).toBeDefined();
    const speed = (m: typeof old) => effectiveRates(m).tierSpeed.drill;
    expect(speed(old)).toBeGreaterThan(0);
    expect(speed(few)).toBeGreaterThan(0);
    expect(speed(old) / speed(few)).toBeCloseTo(4, 6);
  });
});

describe("the Gold rush in the rates", () => {
  const crew = {
    ...minedMountain(0),
    owned: { ...minedMountain(0).owned, helper: 10, kid: 0 },
  };
  const T = 5_000_000;
  const rushed = startRush(holdForRush(crew, 1_000_000, 10), T);

  it("never counts in the crew's speed: held stones were dug while away (#525)", () => {
    const plain = effectiveRates(crew, T);
    expect(effectiveRates(rushed, T).crewPerSecond).toBe(plain.crewPerSecond);
    expect(effectiveRates(rushed, T).exactCrewPerSecond).toBe(
      plain.exactCrewPerSecond,
    );
    const both = effectiveRates(
      { ...rushed, boosts: { ...NO_BOOSTS, overtime: T + 60_000 } },
      T,
    );
    // Overtime's ×2 of the crew, and nothing for the rush
    expect(both.crewPerSecond).toBe(plain.crewPerSecond * 2);
    expect(both.tapYield).toBe(plain.tapYield);
  });

  it("is ignored with no clock", () => {
    expect(effectiveRates(rushed).crewPerSecond).toBe(
      effectiveRates(crew).crewPerSecond,
    );
  });
});

describe("what more hands add (#490)", () => {
  /** What the crew moves on the line (#536). */
  const base = (rates: ReturnType<typeof effectiveRates>): number =>
    lineOf(rates.tierSpeed, rates.running);

  it("a worker with nothing idle adds his own hands", () => {
    // Six carts run the haul; his three a second go to the empty face and
    // lift, half to each.
    const crew = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 6, cart: 6 },
    };
    expect(handsGain(crew, "helper", 1)).toBe(
      (3 * effectiveRates(crew).tierSpeed.helper) / 2,
    );
    expect(startedTier(crew)).toBe(undefined);
  });

  it("a worker who starts an idle cart adds the cart too", () => {
    // A borer and a Great Machine run the face and the lift, so the haul
    // (three of six carts) holds the line.
    const crew = {
      ...minedMountain(0),
      owned: {
        ...minedMountain(0).owned,
        helper: 21,
        cart: 6,
        borer: 1,
        machine: 1,
      },
    };
    const rates = effectiveRates(crew);
    expect(rates.running.cart).toBe(3);
    expect(handsGain(crew, "helper", 1)).toBe(
      3 * rates.tierSpeed.helper + rates.tierSpeed.cart,
    );
    expect(startedTier(crew)).toBe("cart");
    expect(firstIdleTier(crew)).toBe("cart");
  });

  it("is the crew's own rise, before timers, for many hands and for kids", () => {
    const crew = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 20, cart: 30, kid: 2 },
    };
    const timed = { ...crew, boosts: { ...NO_BOOSTS, overtime: 9e15 } };
    for (const [tier, count] of [
      ["helper", 10],
      ["kid", 1],
    ] as const) {
      const more =
        tier === "helper"
          ? {
              ...crew,
              owned: { ...crew.owned, helper: crew.owned.helper + count },
            }
          : { ...crew, owned: { ...crew.owned, kid: crew.owned.kid + count } };
      const rise = base(effectiveRates(more)) - base(effectiveRates(crew));
      expect(handsGain(crew, tier, count)).toBeCloseTo(rise, 9);
      expect(handsGain(timed, tier, count)).toBeCloseTo(rise, 9);
    }
  });

  it("a hand never slows the crew (#500)", () => {
    // 15 hands on 200 drills (every mark) and 2 borers.
    const crew = {
      ...minedMountain(10_000_000),
      owned: {
        ...minedMountain(10_000_000).owned,
        helper: 15,
        drill: 200,
        borer: 2,
      },
    };
    const more = { ...crew, owned: { ...crew.owned, helper: 16 } };
    const rates = effectiveRates(crew);
    expect(base(effectiveRates(more))).toBeGreaterThan(base(rates));
    expect(handsGain(crew, "helper", 1)).toBeCloseTo(
      base(effectiveRates(more)) - base(rates),
      9,
    );
  });

  it("one worker short of a borer's eight starts nothing yet", () => {
    const crew = {
      ...minedMountain(10_000_000),
      owned: { ...minedMountain(10_000_000).owned, helper: 6, borer: 1 },
    };
    expect(startedTier(crew)).toBe(undefined);
    expect(firstIdleTier(crew)).toBe("borer");
    expect(handsGain(crew, "helper", 1)).toBe(
      effectiveRates(crew).tierSpeed.helper,
    );
  });
});

describe("staffing never slows the crew (#500)", () => {
  it("one more worker, drill, borer or machine never mines less, with Grandpa and the floor", () => {
    const posts = ["borer", "machine", "camp"] as const;
    let checked = 0;
    for (const legacy of [0, 1]) {
      for (const post of posts) {
        for (const machines of [0, 1, 2]) {
          for (const borers of [0, 1, 3]) {
            for (const drills of [0, 10, 50]) {
              for (let helpers = 0; helpers <= 60; helpers += 3) {
                const crew = {
                  ...minedMountain(10_000_000),
                  helpers,
                  drills,
                  borers,
                  machines,
                  legacy,
                  engineers:
                    post === "camp"
                      ? []
                      : [
                          {
                            name: "Ada" as const,
                            rank: 0 as const,
                            trips: 0,
                            post,
                          },
                        ],
                };
                const now = effectiveRates(crew).exactCrewPerSecond;
                for (const more of [
                  { ...crew, owned: { ...crew.owned, helper: helpers + 1 } },
                  { ...crew, owned: { ...crew.owned, drill: drills + 1 } },
                  { ...crew, owned: { ...crew.owned, borer: borers + 1 } },
                  { ...crew, owned: { ...crew.owned, machine: machines + 1 } },
                ]) {
                  expect(
                    effectiveRates(more).exactCrewPerSecond,
                  ).toBeGreaterThanOrEqual(now - 1e-6);
                  checked += 1;
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(2 * 3 * 3 * 3 * 3 * 21 * 4);
  });
});

describe("staffing for the line (#534)", () => {
  it("a first Great Machine does not pull the hands off a borer and a pit train", () => {
    // Sixteen hands run a borer and a pit train (two stages) for 48 a
    // second. The machine alone (one stage) would move only 24.
    const crew = {
      ...minedMountain(50_000_000),
      owned: {
        ...minedMountain(50_000_000).owned,
        helper: 16,
        borer: 1,
        train: 2,
      },
      legacy: 0,
      engineers: [],
    };
    const before = effectiveRates(crew);
    const after = effectiveRates({
      ...crew,
      owned: { ...crew.owned, machine: 1 },
    });
    expect(before.exactCrewPerSecond).toBe(48);
    expect(after.exactCrewPerSecond).toBe(48);
    expect(after.running).toMatchObject({ borer: 1, train: 1, machine: 0 });
  });
});

describe("the line's rule (#532, in play since #536)", () => {
  const parts = (rates: ReturnType<typeof effectiveRates>): number =>
    lineSpeed(
      stageSpeeds(rates.tierSpeed, rates.running),
      handsSpeed(rates.tierSpeed, rates.running),
    );
  const sum = (rates: ReturnType<typeof effectiveRates>): number =>
    TIERS.reduce(
      (total, tier) =>
        total + rates.running[tier.id] * rates.tierSpeed[tier.id],
      0,
    );

  it("with no machines the line moves what the hands move", () => {
    const crew = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 12, kid: 3 },
    };
    const line = effectiveRates(crew);
    // Three kids teach every hand 6% (2% each).
    expect(line.exactCrewPerSecond).toBeCloseTo((12 + 3 * 25) * 1.06, 9);
    expect(line.crewPerSecond).toBe(Math.floor((12 + 3 * 25) * 1.06));
  });

  it("with machines the crew moves what the line moves, not the sum", () => {
    const crew = {
      ...minedMountain(10_000_000),
      owned: {
        ...minedMountain(10_000_000).owned,
        helper: 40,
        cart: 12,
        drill: 9,
        borer: 2,
      },
    };
    const line = effectiveRates(crew);
    expect(line.exactCrewPerSecond).toBeCloseTo(parts(line), 9);
    expect(line.crewPerSecond).toBe(Math.floor(parts(line) + 1e-9));
    expect(line.crewPerSecond).toBeLessThan(sum(line));
  });

  it("rates each machine at three times today's, so the first cart, hoist and drill add 6, 9 and 27 (#543)", () => {
    const crew = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 12 },
    };
    const line = (more: MountainPatch): number =>
      effectiveRates(patched(crew, more)).exactCrewPerSecond;
    expect(line({})).toBeCloseTo(12, 9);
    expect(line({ owned: { cart: 1 } })).toBeCloseTo(18, 9);
    expect(line({ owned: { cart: 1, hoist: 1 } })).toBeCloseTo(27, 9);
    expect(line({ owned: { cart: 1, hoist: 1, drill: 1 } })).toBeCloseTo(54, 9);
    const speed = effectiveRates(crew).tierSpeed;
    expect(speed.cart).toBe(18);
    expect(speed.hoist).toBe(60);
    expect(speed.drill).toBe(108);
    expect(speed.helper).toBe(1);
    expect(speed.kid).toBe(25);
  });

  it("tops a tender up to her floor in the line's units, not the plain sum (#543)", () => {
    // The haul is the only stage below the line. Ada's floor, 12% times
    // the tending gain of the untended line, goes to the carts, so the line
    // rises by all of it: 15% of 1,080. Where the hands level two or three
    // stages it rises by less; engineers by stage are #539.
    const crew = {
      ...minedMountain(130_000_000),
      owned: {
        ...minedMountain(130_000_000).owned,
        helper: 60,
        cart: 10,
        drill: 20,
        borer: 2,
        hoist: 20,
        machine: 1,
      },
      legacy: 0,
    };
    const at = (post: "camp" | "cart" | "borer"): number =>
      effectiveRates({
        ...crew,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post }],
      }).exactCrewPerSecond;
    expect(at("camp")).toBeCloseTo(1_080, 9);
    expect(at("cart")).toBeCloseTo(1_080 * 1.15, 9);
    // The face is not narrow, so the borers' post adds nothing.
    expect(at("borer")).toBeCloseTo(1_080, 9);
  });

  it("a hired hand's gain is the line's rise", () => {
    // Three of six carts run; a fourth hand starts one more.
    const crew = {
      ...minedMountain(0),
      owned: { ...minedMountain(0).owned, helper: 3, cart: 6 },
    };
    const more = { ...crew, owned: { ...crew.owned, helper: 4 } };
    expect(handsGain(crew, "helper", 1)).toBeCloseTo(
      parts(effectiveRates(more)) - parts(effectiveRates(crew)),
      9,
    );
  });
});

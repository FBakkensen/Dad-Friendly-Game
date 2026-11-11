import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { TENDING_GAIN, TENDING_TENTHS, station } from "./engineers";
import type { Trouble } from "./hazards";
import { milestoneMultiplier } from "./milestones";
import { holdForRush, startRush } from "./gold-rush";
import { AWAY_PAY_RATE, effectiveRates, tendingGain } from "./rates";
import { minedMountain } from "./test-fixtures";
import { TIERS } from "./tiers";

describe("effectiveRates", () => {
  it("reads one mountain once when no clock is passed", () => {
    const mountain = { ...minedMountain(0), helpers: 3, carts: 1, kids: 0 };
    const first = effectiveRates(mountain);
    expect(effectiveRates(mountain)).toBe(first);
    expect(effectiveRates({ ...mountain })).not.toBe(first);
    expect(effectiveRates({ ...mountain })).toEqual(first);
  });

  it("reads the same mountain again under a sweep, then puts it back", () => {
    const mountain = { ...minedMountain(0), helpers: 3, carts: 1, kids: 0 };
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
      helpers: 11, // staffs the cart (1) and the Great Machine (10)
      carts: 1,
      machines: 1,
      kids: 0,
    });
    expect(rates.tapYield).toBe(1);
    expect(rates.tierSpeed).toEqual(
      Object.fromEntries(TIERS.map((tier) => [tier.id, tier.perSecond])),
    );
    expect(rates.crewPerSecond).toBe(11 + 6 + 2_100);
    expect(rates.exactCrewPerSecond).toBe(rates.crewPerSecond);
    expect(rates.awayPay).toBe(AWAY_PAY_RATE);
  });

  it("keeps the fraction the crew line floors away", () => {
    const rates = effectiveRates({
      ...minedMountain(0),
      helpers: 11,
      kids: 0,
      upgrades: { boots: 1 },
    });
    expect(rates.exactCrewPerSecond).toBeCloseTo(11 * 2.36, 10);
    expect(rates.crewPerSecond).toBe(25);
  });

  it("slows the troubled tier from a quarter toward a half, and not the others", () => {
    const crew = {
      ...minedMountain(0),
      helpers: 9,
      carts: 1,
      borers: 1,
      kids: 0,
    };
    const trouble: Trouble = { kind: "cave-in", tier: "cart", startedAt: 0 };
    const plain = effectiveRates(crew, 0);
    const started = effectiveRates(crew, 0, trouble);
    expect(plain.crewPerSecond).toBe(372);
    expect(started.tierSpeed.cart).toBe(4.5);
    expect(started.tierSpeed.borer).toBe(plain.tierSpeed.borer);
    expect(started.awayPay).toBe(plain.awayPay);
    expect(started.crewPerSecond).toBe(370);
    expect(effectiveRates(crew, 60_000, trouble).tierSpeed.cart).toBe(3.75);
    expect(effectiveRates(crew, 120_000, trouble).tierSpeed.cart).toBe(3);
    expect(effectiveRates(crew, 180_000, trouble).tierSpeed.cart).toBe(3);
    expect(effectiveRates(crew, undefined, trouble).tierSpeed.cart).toBe(4.5);
  });

  it("Grandfather's pick makes taps a little stronger and leaves the crew alone", () => {
    const crew = {
      ...minedMountain(0),
      helpers: 9,
      carts: 1,
      borers: 1,
      kids: 0,
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
      helpers: 8,
      borers: 1,
      engineers: [{ ...ada, post: "borer" as const }],
    };
    const unstaffed = { ...idle, helpers: 0 };
    expect(tendingGain(unstaffed, 0, "borer")).toBe(0);
    const staffed = idle;
    const atCamp = station(staffed, 0, "camp");
    const onBorer = station(staffed, 0, "borer");
    expect(tendingGain(staffed, 0, "borer")).toBe(
      effectiveRates(onBorer).crewPerSecond -
        effectiveRates(atCamp).crewPerSecond,
    );
    expect(tendingGain(staffed, 0, "borer")).toBe(78);
    const two = { ...staffed, helpers: 16, borers: 2 };
    expect(tendingGain(two, 0, "borer")).toBe(156);
    expect(tendingGain(staffed, 9, "borer")).toBe(0);
  });

  it("counts a Great Machine she starts, and not a rank already covered", () => {
    const waiting = {
      ...minedMountain(0),
      helpers: 5,
      machines: 1,
      engineers: [ada],
    };
    const tended = station(waiting, 0, "machine");
    expect(tendingGain(waiting, 0, "machine")).toBe(
      effectiveRates(tended).crewPerSecond -
        effectiveRates(station(waiting, 0, "camp")).crewPerSecond,
    );
    expect(tendingGain(waiting, 0, "machine")).toBeGreaterThan(2_000);
    const covered = {
      ...waiting,
      borers: 1,
      helpers: 18,
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
    expect(tendingGain(journeyman, 1, "borer")).toBe(124);
  });

  it("counts a second post's tenth once, not again on the floor's post (#349)", () => {
    // Ada's borer is the small tier, so the floor branch runs. Nils on the
    // carts adds his tier's tenth and his own floor, nothing more.
    const crew = {
      ...minedMountain(0),
      helpers: 40,
      carts: 4,
      drills: 2,
      borers: 1,
      machines: 1,
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
    // The machine dwarfs one borer, so +10% of the borer is under 9%.
    const crew = {
      ...minedMountain(0),
      helpers: 40,
      carts: 4,
      drills: 2,
      borers: 1,
      machines: 1,
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
          post: "cart" as const,
        },
      ],
    };
    expect(tendingGain(pair, 1, "cart")).toBeGreaterThan(0);
    // The higher rank is the floor, even on the smaller post.
    const masterOnCart = {
      ...crew,
      engineers: [
        { ...ada, post: "borer" as const },
        {
          name: "Nils" as const,
          rank: 2 as const,
          trips: 9,
          post: "cart" as const,
        },
      ],
    };
    expect(effectiveRates(masterOnCart).exactCrewPerSecond).toBeGreaterThan(
      effectiveRates(pair).exactCrewPerSecond,
    );
    // Same rank: the bigger machine sets the floor. A lower rank does not.
    const borerSecond = {
      ...crew,
      engineers: [
        { ...ada, post: "cart" as const },
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
          post: "cart" as const,
        },
        { ...ada, post: "borer" as const },
      ],
    };
    expect(effectiveRates(borerSecond).exactCrewPerSecond).toBeGreaterThan(
      rested.exactCrewPerSecond,
    );
    expect(effectiveRates(masterFirst).exactCrewPerSecond).toBe(
      effectiveRates(masterOnCart).exactCrewPerSecond,
    );
  });

  it("an old save with 30 drills mines x4 at once", () => {
    const old = { ...minedMountain(0), helpers: 40, drills: 30 };
    const few = { ...old, drills: 9 };
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
  const crew = { ...minedMountain(0), helpers: 10, kids: 0 };
  const T = 5_000_000;
  const rushed = startRush(holdForRush(crew, 1_000_000, 10), T);

  it("adds the held stones on top of the crew, Overtime included, and leaves taps alone", () => {
    const plain = effectiveRates(crew, T);
    expect(effectiveRates(rushed, T).crewPerSecond).toBe(
      plain.crewPerSecond * 10,
    );
    const both = effectiveRates(
      { ...rushed, boosts: { overtime: T + 60_000 } },
      T,
    );
    // Overtime's ×2 of the crew, plus the rush's nine crews of held stones
    expect(both.crewPerSecond).toBe(plain.crewPerSecond * 11);
    expect(both.tapYield).toBe(plain.tapYield);
  });

  it("is ignored with no clock", () => {
    expect(effectiveRates(rushed).crewPerSecond).toBe(
      effectiveRates(crew).crewPerSecond,
    );
  });
});

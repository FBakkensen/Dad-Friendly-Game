import { describe, expect, it } from "vitest";
import { station } from "./engineers";
import type { Trouble } from "./hazards";
import { AWAY_PAY_RATE, effectiveRates, tendingGain } from "./rates";
import { minedMountain } from "./test-fixtures";
import { TIERS } from "./tiers";

describe("effectiveRates", () => {
  it("is the plain table with no upgrades: taps 1, tiers at list speed", () => {
    const rates = effectiveRates({
      ...minedMountain(0),
      helpers: 26, // staffs the cart (1) and the Great Machine (25)
      carts: 1,
      machines: 1,
      kids: 0,
    });
    expect(rates.tapYield).toBe(1);
    expect(rates.tierSpeed).toEqual(
      Object.fromEntries(TIERS.map((tier) => [tier.id, tier.perSecond])),
    );
    expect(rates.crewPerSecond).toBe(26 + 10 + 3_500);
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
    expect(plain.crewPerSecond).toBe(614);
    expect(started.tierSpeed.cart).toBe(7.5);
    expect(started.tierSpeed.borer).toBe(plain.tierSpeed.borer);
    expect(started.awayPay).toBe(plain.awayPay);
    expect(started.crewPerSecond).toBe(611);
    expect(effectiveRates(crew, 60_000, trouble).tierSpeed.cart).toBe(6.25);
    expect(effectiveRates(crew, 120_000, trouble).tierSpeed.cart).toBe(5);
    expect(effectiveRates(crew, 180_000, trouble).tierSpeed.cart).toBe(5);
    expect(effectiveRates(crew, undefined, trouble).tierSpeed.cart).toBe(7.5);
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
    expect(tendingGain(staffed, 0, "borer")).toBe(96);
    const two = { ...staffed, helpers: 16, borers: 2 };
    expect(tendingGain(two, 0, "borer")).toBe(192);
    expect(tendingGain(staffed, 9, "borer")).toBe(0);
  });

  it("counts a Great Machine she starts, and not a rank already covered", () => {
    const waiting = {
      ...minedMountain(0),
      helpers: 10,
      machines: 1,
      engineers: [ada],
    };
    const tended = station(waiting, 0, "machine");
    expect(tendingGain(waiting, 0, "machine")).toBe(
      effectiveRates(tended).crewPerSecond -
        effectiveRates(station(waiting, 0, "camp")).crewPerSecond,
    );
    expect(tendingGain(waiting, 0, "machine")).toBeGreaterThan(3_000);
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
    expect(tendingGain(journeyman, 1, "borer")).toBe(96);
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
});

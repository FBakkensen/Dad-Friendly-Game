import { describe, expect, it } from "vitest";
import { listActions } from "../economy/actions";
import { withFactors } from "../economy/factors";
import { LINE_OFF } from "../line";
import { effectiveRates } from "../rates";
import { createMountain } from "../mountain";
import { DAD_SCHEDULE } from "../pacing";
import { singleShareOf } from "./measures/singleShare";
import { scoreDecision } from "./score";
import { BORER_SOURCE, CRAFTED_SOURCE, TENDING_SOURCE } from "./targets";
import { NOTHING_CRAFTED } from "../workshop";

const ada = { name: "Ada", rank: 0, trips: 0, post: "borer" } as const;

describe("scoreDecision", () => {
  it("gives singleShare 1 when the only crew buy is affordable", () => {
    const mountain = { ...createMountain(), pocket: 100 };
    const actions = listActions(mountain, 0).filter(
      (action) => action.kind === "buyTier",
    );
    expect(actions).toHaveLength(1);
    const sample = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      actions,
      atMs: 0,
    });
    expect(sample.liveCount).toBe(1);
    expect(sample.byValue.liveCount).toBe(1);
    expect(sample.affordableLive).toBe(1);
    expect(sample.byValue.affordableLive).toBe(1);
    expect(sample.waitToAffordSec).toBe(0);
    expect(sample.bestId).toBe("buyTier:helper");
    expect(sample.nextPaybackRatio).toBe(Number.POSITIVE_INFINITY);
    expect(singleShareOf([sample])).toBe(1);
    expect(singleShareOf([sample], "value")).toBe(1);
  });

  it("scores the whole table when the caller does not pass one", () => {
    // An unstaffed cart opens Sharper picks and Steady hands (#250).
    const mountain = { ...createMountain(), carts: 1, pocket: 100 };
    const sample = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      atMs: 0,
    });
    expect(sample.optionKinds.length).toBeGreaterThan(1);
    expect(sample.crewPerSec).toBe(0);
    expect(sample.nextPaybackRatio).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(sample.nextPaybackRatio)).toBe(true);
  });

  it("splits tending out of the borer's output", () => {
    const mountain = {
      ...createMountain(),
      helpers: 8,
      borers: 1,
      pocket: 1,
      engineers: [ada],
    };
    const sample = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      actions: [],
      atMs: 0,
    });
    expect(sample.outputShare[TENDING_SOURCE] ?? 0).toBeGreaterThan(0);
    expect(sample.outputShare[BORER_SOURCE] ?? 0).toBeGreaterThan(0);
    const sum = Object.values(sample.outputShare).reduce(
      (total, share) => total + share,
      0,
    );
    expect(sum).toBeCloseTo(1, 5);
    expect(sample.liveCount).toBe(0);
    expect(sample.nextPaybackRatio).toBe(Number.POSITIVE_INFINITY);
  });

  it("with the line on, keeps the machines' shares in the line's units and reads the line (#534)", () => {
    const mountain = {
      ...createMountain(),
      helpers: 4,
      carts: 2,
      hoists: 1,
      drills: 1,
      crafted: { ...NOTHING_CRAFTED, "iron-rails": 1 as const },
    };
    const context = { ...DAD_SCHEDULE, tapsPerSecond: 0 };
    const off = scoreDecision({
      mountain,
      now: 0,
      context,
      actions: [],
      atMs: 0,
    });
    expect(off.line).toBeUndefined();
    withFactors({ [LINE_OFF]: 0 }, () => {
      const sample = scoreDecision({
        mountain,
        now: 0,
        context,
        actions: [],
        atMs: 0,
      });
      const bare = effectiveRates({ ...mountain, crafted: NOTHING_CRAFTED });
      const gear =
        effectiveRates(mountain).exactCrewPerSecond - bare.exactCrewPerSecond;
      expect(gear).toBeGreaterThan(0);
      expect(sample.outputShare[CRAFTED_SOURCE]).toBeCloseTo(
        gear / (bare.exactCrewPerSecond + gear),
        9,
      );
      // Two carts are the narrow stage, and the rails speed them up.
      expect(sample.line?.narrow).toBe("haul");
      expect(sample.line?.handsCarry).toBeGreaterThan(0);
      expect(sample.line?.handsCarry).toBeLessThan(1);
    });
  });

  it("splits crafted gear out of the crew", () => {
    const mountain = {
      ...createMountain(),
      helpers: 4,
      carts: 2,
      crafted: { ...NOTHING_CRAFTED, "iron-rails": 1 as const },
    };
    const sample = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      actions: [],
      atMs: 0,
    });
    expect(sample.outputShare[CRAFTED_SOURCE] ?? 0).toBeGreaterThan(0);
    expect(sample.outputShare["cart"] ?? 0).toBeGreaterThan(0);
    const sum = Object.values(sample.outputShare).reduce(
      (total, share) => total + share,
      0,
    );
    expect(sum).toBeCloseTo(1, 5);
    expect(sample.layer).toBe("topsoil");
    expect(sample.workshopOpen).toBe(false);
    expect(sample.benchFree).toBe(true);
    // The Topsoil bench takes clay-only recipes; iron ones wait for the Granite (#244).
    expect(sample.openRecipes).not.toContain("iron-rails");
  });

  it("treats a free improvement as infinitely good per stone", () => {
    const mountain = {
      ...createMountain(),
      helpers: 8,
      borers: 1,
      pocket: 1,
      engineers: [{ ...ada, post: "camp" as const }],
    };
    const helpful = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      actions: [{ kind: "station", index: 0, post: "borer" }],
      atMs: 0,
    });
    expect(helpful.byValue.perStone).toBe(Number.POSITIVE_INFINITY);
    expect(helpful.byValue.liveCount).toBe(1);
    expect(helpful.bestId).toBe("station:0:borer");
    expect(helpful.waitToAffordSec).toBe(0);

    const useless = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      actions: [{ kind: "station", index: 0, post: "cart" }],
      atMs: 1,
    });
    expect(useless.byValue.liveCount).toBe(0);
    expect(useless.liveCount).toBe(0);
  });
});

import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DecisionSample } from "./measure";
import { parseMeasureExport } from "./measure";
import benchIdle, { benchIdleShare } from "./measures/benchIdle";
import craftShare from "./measures/craftShare";
import dominantShare from "./measures/dominantShare";
import extremeWinMeasure from "./measures/extremeWin";
import { extremeWin } from "./measures/extremeWin";
import featureShare from "./measures/featureShare";
import finishDay from "./measures/finishDay";
import liveMedian from "./measures/liveMedian";
import liveP10 from "./measures/liveP10";
import { longestDeadHours } from "./stretch";
import regretMeasure from "./measures/regret";
import { regret } from "./measures/regret";
import { singleShareOf } from "./measures/singleShare";
import { neverBest } from "./measures/typeEverBest";
import { discover } from "./registry";
import { applyScope } from "./scope";
import materialIdle, {
  longestMaterialIdleDays,
  materialDemand,
  materialIsIdle,
} from "./measures/materialIdle";
import {
  BORER_SOURCE,
  CRAFTED_SOURCE,
  DAY_MS,
  DEAD_STRETCH,
  HOUR_MS,
  TENDING_SOURCE,
} from "./targets";

function decision(
  over: {
    readonly atMs?: number;
    readonly liveCount?: number;
    readonly affordableLive?: number;
    readonly bestId?: string;
    readonly bestKind?: DecisionSample["bestKind"];
    readonly waitToAffordSec?: number;
    readonly outputShare?: DecisionSample["outputShare"];
    readonly optionKinds?: DecisionSample["optionKinds"];
    readonly finishDay?: number;
    readonly valueLive?: number;
    readonly valueAffordable?: number;
    readonly stretchLive?: number;
    readonly stretchAffordable?: number;
    readonly stretchWait?: number;
    readonly layer?: DecisionSample["layer"];
    readonly workshopOpen?: boolean;
    readonly benchFree?: boolean;
    readonly materials?: DecisionSample["materials"];
    readonly openRecipes?: DecisionSample["openRecipes"];
    readonly knownRecipes?: DecisionSample["knownRecipes"];
    readonly crafted?: DecisionSample["crafted"];
    readonly unlimitedSinks?: DecisionSample["unlimitedSinks"];
  } = {},
): DecisionSample {
  const liveCount = over.liveCount ?? 1;
  const affordableLive = over.affordableLive ?? 0;
  const bestId = over.bestId ?? "buyTier:helper";
  const wait = over.waitToAffordSec ?? 1;
  return {
    atMs: over.atMs ?? 0,
    liveCount,
    affordableLive,
    bestId,
    bestKind: over.bestKind ?? "buyTier",
    waitToAffordSec: wait,
    crewPerSec: 1,
    pocket: 0,
    outputShare: over.outputShare ?? {},
    ...(over.layer === undefined ? {} : { layer: over.layer }),
    ...(over.workshopOpen === undefined
      ? {}
      : { workshopOpen: over.workshopOpen }),
    ...(over.benchFree === undefined ? {} : { benchFree: over.benchFree }),
    ...(over.materials === undefined ? {} : { materials: over.materials }),
    ...(over.openRecipes === undefined
      ? {}
      : { openRecipes: over.openRecipes }),
    ...(over.knownRecipes === undefined
      ? {}
      : { knownRecipes: over.knownRecipes }),
    ...(over.crafted === undefined ? {} : { crafted: over.crafted }),
    ...(over.unlimitedSinks === undefined
      ? {}
      : { unlimitedSinks: over.unlimitedSinks }),
    optionKinds: over.optionKinds ?? ["buyTier"],
    byValue: {
      liveCount: over.valueLive ?? liveCount,
      affordableLive: over.valueAffordable ?? affordableLive,
      bestId,
      waitToAffordSec: wait,
      perStone: 1,
    },
    nextPaybackRatio: 1,
    stretch: {
      payback: {
        liveCount: over.stretchLive ?? liveCount,
        affordableLive: over.stretchAffordable ?? affordableLive,
        waitToAffordSec: over.stretchWait ?? wait,
        bestId,
      },
      value: {
        liveCount: over.valueLive ?? over.stretchLive ?? liveCount,
        affordableLive:
          over.valueAffordable ?? over.stretchAffordable ?? affordableLive,
        waitToAffordSec: over.stretchWait ?? wait,
        bestId,
      },
      nextPaybackRatio: 1,
    },
    ...(over.finishDay === undefined ? {} : { finishDay: over.finishDay }),
  };
}

describe("measures", () => {
  it("gives every registered measure a one-line why", async () => {
    const dir = path.resolve("src/lab/measures");
    const measures = await discover(dir, parseMeasureExport);
    expect(measures.map((measure) => measure.id)).toEqual([
      "benchIdle",
      "craftShare",
      "dominantShare",
      "extremeWin",
      "featureShare",
      "finishDay",
      "liveMedian",
      "liveP10",
      "longestDeadStretch",
      "longestValueStretch",
      "materialIdle",
      "regret",
      "singleShare",
      "typeEverBest",
    ]);
    for (const measure of measures) {
      expect(measure.why.includes(" ")).toBe(true);
      expect(measure.why.includes("\n")).toBe(false);
      expect(() => measure.aggregate([])).not.toThrow();
    }
  });

  it("takes the median and the tenth percentile of the live count", () => {
    const samples = [1, 2, 3, 4].map((liveCount, index) =>
      decision({ atMs: index, liveCount }),
    );
    expect(liveMedian.aggregate(samples)).toBe(2.5);
    expect(liveMedian.aggregate([])).toBe(0);
    expect(liveP10.aggregate(samples)).toBeCloseTo(1.3, 5);
    const wide = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((liveCount, index) =>
      decision({ atMs: index, liveCount }),
    );
    expect(liveP10.aggregate(wide)).toBeCloseTo(1.9, 5);
  });

  it("counts a single live option as the whole share", () => {
    const one = decision({ liveCount: 1, valueLive: 1 });
    const many = decision({ liveCount: 4, valueLive: 4, atMs: 1 });
    expect(singleShareOf([one, one])).toBe(1);
    expect(singleShareOf([one, many])).toBe(0.5);
    expect(singleShareOf([one, many], "value")).toBe(0.5);
    expect(singleShareOf([])).toBe(0);
  });

  it("measures a wait-only stretch in hours", () => {
    const hour = HOUR_MS;
    const waiting = { waitToAffordSec: DEAD_STRETCH.minWaitSec };
    const samples = [
      decision({ atMs: 0, ...waiting }),
      decision({ atMs: hour, ...waiting }),
      decision({ atMs: hour + hour, ...waiting }),
      decision({
        atMs: hour + hour + hour,
        affordableLive: 1,
        valueAffordable: 1,
      }),
    ];
    expect(longestDeadHours(samples, "payback")).toBe(3);
    expect(longestDeadHours(samples, "value")).toBe(3);
    const paybackOnly = [
      decision({
        atMs: 0,
        affordableLive: 1,
        valueAffordable: 0,
        ...waiting,
      }),
      decision({
        atMs: hour,
        affordableLive: 1,
        valueAffordable: 0,
        ...waiting,
      }),
      decision({ atMs: hour + hour, affordableLive: 1, valueAffordable: 1 }),
    ];
    expect(longestDeadHours(paybackOnly, "payback")).toBe(0);
    expect(longestDeadHours(paybackOnly, "value")).toBe(2);
    expect(longestDeadHours([], "payback")).toBe(0);
  });

  it("does not turn a short end-of-session save into the overnight gap", () => {
    const fewMinutes = 3 * 60;
    const overnight = 12 * HOUR_MS;
    const samples = [
      decision({ atMs: 0, waitToAffordSec: fewMinutes }),
      decision({
        atMs: overnight,
        affordableLive: 1,
        valueAffordable: 1,
        waitToAffordSec: 0,
      }),
    ];
    expect(fewMinutes).toBeLessThan(DEAD_STRETCH.minWaitSec);
    expect(longestDeadHours(samples, "payback")).toBe(0);
    expect(longestDeadHours(samples, "value")).toBe(0);
  });

  it("counts a wait of one session that spans the gap", () => {
    const overnight = 12 * HOUR_MS;
    const samples = [
      decision({ atMs: 0, waitToAffordSec: DEAD_STRETCH.minWaitSec }),
      decision({
        atMs: overnight,
        affordableLive: 1,
        valueAffordable: 1,
        waitToAffordSec: 0,
      }),
    ];
    expect(longestDeadHours(samples, "payback")).toBe(overnight / HOUR_MS);
    expect(longestDeadHours(samples, "value")).toBe(overnight / HOUR_MS);
  });

  it("does not let a cheap affordable move hide the unpaid gap", () => {
    const hour = HOUR_MS;
    const samples = [
      decision({
        atMs: 0,
        affordableLive: 1,
        valueAffordable: 1,
        waitToAffordSec: 0,
        stretchAffordable: 0,
        stretchWait: DEAD_STRETCH.minWaitSec,
      }),
      decision({
        atMs: hour + hour,
        affordableLive: 1,
        valueAffordable: 1,
        waitToAffordSec: 0,
      }),
    ];
    expect(longestDeadHours(samples, "payback")).toBe(2);
    expect(longestDeadHours(samples, "value")).toBe(0);
  });

  it("leaves the first hour out of the dominant share", () => {
    const hour = HOUR_MS;
    const samples = [
      decision({ atMs: 0, bestId: "buyTier:helper" }),
      decision({ atMs: hour, bestId: "buyTier:machine" }),
      decision({ atMs: hour + hour, bestId: "buyTier:machine" }),
      decision({ atMs: hour + hour + hour, bestId: "buyTier:machine" }),
      decision({ atMs: hour * 4, bestId: "buyTier:cart" }),
    ];
    expect(dominantShare.aggregate(samples)).toBe(0.75);
    expect(dominantShare.aggregate([decision({ atMs: 0 })])).toBe(0);
  });

  it("lists kinds that were offered and never best", () => {
    expect(
      neverBest([
        decision({
          optionKinds: ["buyTier", "buyUpgrade"],
          bestKind: "buyTier",
        }),
      ]),
    ).toEqual(["buyUpgrade"]);
    expect(neverBest([])).toEqual([]);
  });

  it("averages tending's share of output", () => {
    const samples = [
      decision({ outputShare: { [TENDING_SOURCE]: 0.1, [BORER_SOURCE]: 0.5 } }),
      decision({
        atMs: 1,
        outputShare: { [TENDING_SOURCE]: 0.3, [BORER_SOURCE]: 0.4 },
      }),
    ];
    expect(featureShare.aggregate(samples)).toBeCloseTo(0.2, 5);
    expect(featureShare.aggregate([])).toBeNaN();
    const first = samples[0];
    expect(first).toBeDefined();
    expect(featureShare.sample?.(first ?? decision({}))).toBeCloseTo(0.1, 5);
  });

  it("reads the finish day, the regret, and an extreme's win", () => {
    expect(finishDay.aggregate([decision({ finishDay: 5.5 })])).toBe(5.5);
    expect(finishDay.aggregate([])).toBe(Number.POSITIVE_INFINITY);
    expect(regret(5.5, 5)).toBeCloseTo(1.1, 5);
    expect(regret(1, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(
      regretMeasure.aggregate([decision({ finishDay: 5 })], {
        optimizerFinishDay: 4,
      }),
    ).toBe(1.25);
    expect(regretMeasure.aggregate([decision({ finishDay: 5 })])).toBeNaN();
    expect(extremeWin(4, 5)).toBeCloseTo(0.2, 5);
    expect(extremeWin(4, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(
      extremeWinMeasure.aggregate([decision({ finishDay: 4 })], {
        casualFinishDay: 5,
      }),
    ).toBeCloseTo(0.2, 5);
  });

  it("filters samples for an after-hour scope and a source that has started", () => {
    const early = decision({ atMs: 0, outputShare: { helper: 1 } });
    const later = decision({
      atMs: HOUR_MS,
      outputShare: { [BORER_SOURCE]: 0.4 },
    });
    expect(applyScope({ kind: "all" }, [early, later])).toHaveLength(2);
    expect(applyScope({ kind: "afterHour", hour: 1 }, [early, later])).toEqual([
      later,
    ]);
    expect(
      applyScope({ kind: "fromSource", source: BORER_SOURCE }, [early, later]),
    ).toEqual([later]);
    expect(
      applyScope({ kind: "fromSource", source: BORER_SOURCE }, [early]),
    ).toEqual([]);
    expect(
      applyScope({ kind: "policies", ids: ["casual-2x10"] }, [early]),
    ).toEqual([early]);
    const topsoil = decision({ atMs: 0, layer: "topsoil" });
    const granite = decision({ atMs: 1, layer: "granite" });
    const deeper = decision({ atMs: 2, layer: "heart" });
    expect(
      applyScope({ kind: "fromLayer", layer: "granite" }, [
        topsoil,
        granite,
        deeper,
      ]),
    ).toEqual([granite, deeper]);
    expect(
      applyScope({ kind: "fromLayer", layer: "granite" }, [topsoil]),
    ).toEqual([]);
    expect(
      applyScope({ kind: "fromLayer", layer: "granite" }, [decision()]),
    ).toEqual([]);
    expect(applyScope({ kind: "fromLayer", layer: "granite" }, [])).toEqual([]);
  });

  it("reads crafted share, idle materials, and an empty bench", () => {
    const share = decision({
      outputShare: { [CRAFTED_SOURCE]: 0.1, helper: 0.9 },
    });
    expect(craftShare.aggregate([share, decision()])).toBeCloseTo(0.05, 5);
    expect(craftShare.aggregate([])).toBeNaN();
    expect(craftShare.sample?.(share)).toBeCloseTo(0.1, 5);

    const open = {
      workshopOpen: true as const,
      materials: { clay: 6, iron: 0, crystal: 0, heartstone: 0 },
      knownRecipes: [] as const,
    };
    const stuck = decision({ atMs: 0, ...open });
    const still = decision({ atMs: DAY_MS, ...open });
    const held = decision({
      atMs: DAY_MS,
      workshopOpen: true,
      materials: { clay: 6, iron: 0, crystal: 0, heartstone: 0 },
      knownRecipes: ["blasting-charge"],
    });
    const sinking = decision({
      ...held,
      unlimitedSinks: ["blasting-charge"],
    });
    expect(materialIsIdle(stuck)).toBe(true);
    expect(materialIsIdle(held)).toBe(true);
    expect(materialIsIdle(sinking)).toBe(false);
    expect(materialIsIdle(decision({ workshopOpen: false }))).toBe(false);
    expect(materialIsIdle(decision({ workshopOpen: true }))).toBe(false);
    expect(longestMaterialIdleDays([stuck, still])).toBe(1);
    expect(longestMaterialIdleDays([stuck, held])).toBe(1);
    expect(materialIdle.aggregate([])).toBe(0);

    const ironRecipes = [
      "iron-rails",
      "sturdy-props",
      "reinforce",
      "crystal-lamp",
      "engineers-kit",
    ] as const;
    const ironCap = materialDemand("iron", ironRecipes, {}, []);
    expect(ironCap).toBe(104);
    const pocket = { clay: 0, iron: ironCap, crystal: 0, heartstone: 0 };
    const atCap = decision({
      workshopOpen: true,
      materials: pocket,
      knownRecipes: ironRecipes,
    });
    const over = decision({
      atMs: DAY_MS,
      workshopOpen: true,
      materials: { ...pocket, iron: ironCap + 1 },
      knownRecipes: ironRecipes,
    });
    expect(materialIsIdle(atCap)).toBe(false);
    expect(materialIsIdle(over)).toBe(true);
    const later = decision({
      atMs: DAY_MS + DAY_MS,
      workshopOpen: true,
      materials: { ...pocket, iron: ironCap + 1 },
      knownRecipes: ironRecipes,
    });
    expect(longestMaterialIdleDays([over, later])).toBe(1);

    const busy = decision({
      atMs: 0,
      workshopOpen: true,
      benchFree: false,
    });
    const freeLater = decision({
      atMs: DAY_MS,
      workshopOpen: true,
      benchFree: true,
    });
    const free = decision({
      atMs: 0,
      workshopOpen: true,
      benchFree: true,
    });
    const busyLater = decision({
      atMs: DAY_MS,
      workshopOpen: true,
      benchFree: false,
    });
    expect(benchIdleShare([busy, freeLater])).toBe(0);
    expect(benchIdleShare([free, busyLater])).toBe(1);
    expect(benchIdleShare([decision({ workshopOpen: false })])).toBeNaN();
    expect(benchIdle.aggregate([free, free])).toBeNaN();
  });
});

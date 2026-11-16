import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DecisionSample } from "./measure";
import { parseMeasureExport } from "./measure";
import dominantShare from "./measures/dominantShare";
import extremeWinMeasure from "./measures/extremeWin";
import { extremeWin } from "./measures/extremeWin";
import finishDay from "./measures/finishDay";
import liveMedian from "./measures/liveMedian";
import liveP10 from "./measures/liveP10";
import { longestDeadHours } from "./stretch";
import regretMeasure from "./measures/regret";
import { regret } from "./measures/regret";
import singleShare, { singleShareOf } from "./measures/singleShare";
import { neverBest } from "./measures/typeEverBest";
import { discover } from "./registry";
import { applyScope } from "./scope";
import { BORER_SOURCE, DEAD_STRETCH, HOUR_MS } from "./targets";

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
    readonly stretchBestId?: string;
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
    optionKinds: over.optionKinds ?? ["buyTier"],
    nextPaybackRatio: 1,
    stretch: {
      payback: {
        liveCount: over.stretchLive ?? liveCount,
        affordableLive: over.stretchAffordable ?? affordableLive,
        waitToAffordSec: over.stretchWait ?? wait,
        bestId: over.stretchBestId ?? bestId,
      },
      value: {
        liveCount: over.valueLive ?? over.stretchLive ?? liveCount,
        affordableLive:
          over.valueAffordable ?? over.stretchAffordable ?? affordableLive,
        waitToAffordSec: over.stretchWait ?? wait,
        bestId: over.stretchBestId ?? bestId,
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
      "bestOpenShare",
      "bestWaitSittings",
      "buysPerSitting",
      "cageGap",
      "deadGood",
      "dominantShare",
      "extremeWin",
      "fewestMachineBuys",
      "finishDay",
      "handsCarry",
      "hoistWorkers",
      "idleMachines",
      "idleWorkers",
      "liveMedian",
      "liveP10",
      "longestDeadStretch",
      "longestValueStretch",
      "machineRevealSittings",
      "narrowRun",
      "narrowShare",
      "nightFull",
      "nightFullAt",
      "regret",
      "revealNeverUsed",
      "revealSlowest",
      "revealToUse",
      "revealToUseP90",
      "shareMoves",
      "singleShare",
      "siteFull",
      "sliceDays",
      "smallRevealSittings",
      "starved",
      "tapsPerSitting",
      "transportLimit",
      "typeEverBest",
      "workerMoves",
      "zeroBuySittings",
      "zeroGainBuys",
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

  it("reads single options from the dad's own table, not every legal move", () => {
    const own = decision({ liveCount: 3, stretchLive: 1, valueLive: 3 });
    expect(singleShareOf([own])).toBe(1);
    expect(singleShare.sample?.(own)).toBe(1);
    const ownValue = decision({ liveCount: 1, valueLive: 3, stretchLive: 1 });
    expect(singleShareOf([ownValue], "value")).toBe(0);
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

  it("counts the dad's own best spend, not the best legal move", () => {
    const hour = HOUR_MS;
    const samples = [
      decision({
        atMs: hour,
        bestId: "promote",
        stretchBestId: "buyTier:drill",
      }),
      decision({
        atMs: hour * 2,
        bestId: "promote",
        stretchBestId: "buyTier:cart",
      }),
    ];
    expect(dominantShare.aggregate(samples)).toBe(0.5);
    const empty = [
      ...samples,
      decision({ atMs: hour * 3, bestId: "promote", stretchBestId: "" }),
    ];
    expect(dominantShare.aggregate(empty)).toBe(0.5);
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
  });
});

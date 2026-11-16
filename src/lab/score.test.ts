import { describe, expect, it } from "vitest";
import { listActions, type ValueContext } from "../economy/actions";
import { createMountain, type Mountain } from "../mountain";
import { singleShareOf } from "./measures/singleShare";
import { scoreDecision } from "./score";

/** Two ten-minute sittings a day: what the old pacing sim's dad played (#738 moved it here). */
const DAD_SCHEDULE: ValueContext = {
  liveSeconds: 10 * 60,
  awaySeconds: 12 * 60 * 60 - 10 * 60,
};

/** A fresh mine with one worker on drilling, one on haulage and one free: hoisting would start the line. */
function readyToLift(): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: 3 },
    jobs: { ...start.jobs, drilling: 1, haulage: 1 },
    stock: { ...start.stock, stones: 100 },
  };
}

describe("scoreDecision", () => {
  it("gives singleShare 1 when the only move on the table pays", () => {
    const sample = scoreDecision({
      mountain: readyToLift(),
      now: 0,
      context: DAD_SCHEDULE,
      actions: [{ kind: "placeWorker", job: "hoisting", count: 1 }],
      atMs: 0,
    });
    expect(sample.liveCount).toBe(1);
    expect(sample.stretch.value.liveCount).toBe(1);
    expect(sample.affordableLive).toBe(1);
    expect(sample.stretch.value.affordableLive).toBe(1);
    expect(sample.waitToAffordSec).toBe(0);
    expect(sample.bestId).toBe("placeWorker:hoisting");
    expect(sample.nextPaybackRatio).toBe(Number.POSITIVE_INFINITY);
    expect(singleShareOf([sample])).toBe(1);
    expect(singleShareOf([sample], "value")).toBe(1);
  });

  it("scores the whole table when the caller does not pass one", () => {
    const mountain = readyToLift();
    const sample = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      atMs: 0,
    });
    expect([...sample.optionKinds].sort()).toEqual(
      [
        ...new Set(listActions(mountain, 0).map((action) => action.kind)),
      ].sort(),
    );
    expect(sample.optionKinds.length).toBeGreaterThan(1);
    expect(sample.liveCount).toBe(1);
    // Nobody hoists yet, so the line moves nothing.
    expect(sample.crewPerSec).toBe(0);
  });

  it("treats a free improvement as infinitely good per stone", () => {
    const mountain = readyToLift();
    const helpful = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      actions: [{ kind: "placeWorker", job: "hoisting", count: 1 }],
      atMs: 0,
    });
    expect(helpful.stretch.value.bestId).toBe("placeWorker:hoisting");
    expect(helpful.stretch.value.liveCount).toBe(1);
    expect(helpful.bestId).toBe("placeWorker:hoisting");
    expect(helpful.waitToAffordSec).toBe(0);

    const useless = scoreDecision({
      mountain,
      now: 0,
      context: DAD_SCHEDULE,
      actions: [{ kind: "placeWorker", job: "drilling", count: 1 }],
      atMs: 1,
    });
    expect(useless.stretch.value.liveCount).toBe(0);
    expect(useless.liveCount).toBe(0);
  });
});

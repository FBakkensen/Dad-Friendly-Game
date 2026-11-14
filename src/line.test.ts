import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import {
  LINE_OFF,
  MACHINE_STAGE,
  STAGES,
  handsSpeed,
  lineOn,
  lineSpeed,
  stageSpeeds,
  type StageSpeeds,
} from "./line";
import { MACHINE_IDS, type TierId } from "./tiers";

const stages = (face: number, haul: number, lift: number): StageSpeeds => ({
  face,
  haul,
  lift,
});

/** Twelve workers at 1 stone a second each (the spec's examples). */
const TWELVE = 12;

describe("the stages", () => {
  it("carts haul, drills and borers work the face, the Great Machine lifts", () => {
    expect(STAGES).toEqual(["face", "haul", "lift"]);
    expect(MACHINE_STAGE).toEqual({
      cart: "haul",
      drill: "face",
      borer: "face",
      machine: "lift",
    });
    for (const id of MACHINE_IDS) {
      expect(STAGES).toContain(MACHINE_STAGE[id]);
    }
  });

  it("a stage moves what its running machines move; the hands are workers and kids", () => {
    const speed: Record<TierId, number> = {
      helper: 2,
      cart: 6,
      drill: 36,
      borer: 357,
      machine: 2100,
      kid: 25,
    };
    const running: Record<TierId, number> = {
      helper: 30,
      cart: 4,
      drill: 3,
      borer: 2,
      machine: 1,
      kid: 2,
    };
    expect(stageSpeeds(speed, running)).toEqual({
      face: 3 * 36 + 2 * 357,
      haul: 4 * 6,
      lift: 2100,
    });
    expect(handsSpeed(speed, running)).toBe(30 * 2 + 2 * 25);
  });
});

describe("the line's speed (spec, step 1, the rule)", () => {
  it("with no machines the line moves what the hands move", () => {
    expect(lineSpeed(stages(0, 0, 0), TWELVE)).toBe(12);
  });

  it("plays the spec's worked numbers", () => {
    // The first cart (rated 18) lets the hands stop carrying: 12 → 18.
    expect(lineSpeed(stages(0, 18, 0), TWELVE)).toBe(18);
    // A first hoist (60) adds 9, and a first drill (108) after it adds 27.
    expect(lineSpeed(stages(0, 18, 60), TWELVE)).toBe(27);
    expect(lineSpeed(stages(108, 18, 60), TWELVE)).toBe(54);
    // A second cart with no hoist adds nothing.
    expect(lineSpeed(stages(0, 36, 0), TWELVE)).toBe(18);
  });

  it("with no hands the lowest stage holds the line", () => {
    expect(lineSpeed(stages(500, 40, 90), 0)).toBe(40);
    expect(lineSpeed(stages(0, 0, 0), 0)).toBe(0);
  });

  it("the hands lift the lowest stage to the next, then both", () => {
    // Hand work 3 × 10 = 30: the haul rises from 40 to the lift's 60
    // (20 of it), and the last 10 is split over both: 65.
    expect(lineSpeed(stages(500, 40, 60), 10)).toBe(65);
    // Hand work 3 × 100 = 300 lifts every stage: (300 + 600) / 3.
    expect(lineSpeed(stages(100, 200, 300), 100)).toBe(300);
  });

  it("is the largest level the hands' work reaches (the exact form)", () => {
    const random = seeded(532);
    for (let at = 0; at < 2000; at += 1) {
      const line = stages(random() * 1000, random() * 1000, random() * 1000);
      const hands = random() * 400;
      const level = lineSpeed(line, hands);
      expect(work(line, level)).toBeCloseTo(3 * hands, 6);
    }
  });

  it("more hands, or a faster stage, never slow the line", () => {
    const random = seeded(7);
    for (let at = 0; at < 2000; at += 1) {
      const line = stages(random() * 1000, random() * 1000, random() * 1000);
      const hands = random() * 400;
      const level = lineSpeed(line, hands);
      expect(lineSpeed(line, hands + random() * 50)).toBeGreaterThanOrEqual(
        level,
      );
      for (const stage of STAGES) {
        const faster = { ...line, [stage]: line[stage] + random() * 500 };
        expect(lineSpeed(faster, hands)).toBeGreaterThanOrEqual(level);
      }
    }
  });
});

describe("the switch", () => {
  it("is off in play and on when a sweep sets line.off to 0", () => {
    expect(lineOn()).toBe(false);
    expect(withFactors({ [LINE_OFF]: 0 }, lineOn)).toBe(true);
    expect(withFactors({ [LINE_OFF]: 1 }, lineOn)).toBe(false);
  });
});

/** The hand work a level takes: what every stage is short of it. */
function work(line: StageSpeeds, level: number): number {
  return STAGES.reduce(
    (total, stage) => total + Math.max(0, level - line[stage]),
    0,
  );
}

/** A small seeded random (mulberry32), so a failure replays. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

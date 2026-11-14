import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import {
  LINE_OFF,
  MACHINE_STAGE,
  STAGES,
  handsSpeed,
  lineOn,
  lineOf,
  lineSpeed,
  lineView,
  narrowStage,
  stageOf,
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
  it("carts and pit trains haul, drills and borers work the face, hoists and the Great Machine lift", () => {
    expect(STAGES).toEqual(["face", "haul", "lift"]);
    expect(MACHINE_STAGE).toEqual({
      cart: "haul",
      hoist: "lift",
      drill: "face",
      borer: "face",
      train: "haul",
      machine: "lift",
    });
    for (const id of MACHINE_IDS) {
      expect(STAGES).toContain(MACHINE_STAGE[id]);
      expect(stageOf(id)).toBe(MACHINE_STAGE[id]);
    }
    expect(stageOf("helper")).toBeUndefined();
    expect(stageOf("kid")).toBeUndefined();
  });

  it("a stage moves what its running machines move; the hands are workers and kids", () => {
    const speed: Record<TierId, number> = {
      helper: 2,
      cart: 6,
      hoist: 20,
      drill: 36,
      borer: 357,
      train: 1067,
      machine: 2100,
      kid: 25,
    };
    const running: Record<TierId, number> = {
      helper: 30,
      cart: 4,
      hoist: 5,
      drill: 3,
      borer: 2,
      train: 1,
      machine: 1,
      kid: 2,
    };
    expect(stageSpeeds(speed, running)).toEqual({
      face: 3 * 36 + 2 * 357,
      haul: 4 * 6 + 1067,
      lift: 5 * 20 + 2100,
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

describe("what the lab reads off the line (#534)", () => {
  it("the narrow stage is the slowest, the first in rock order on a tie", () => {
    expect(narrowStage(stages(5, 3, 4))).toBe("haul");
    expect(narrowStage(stages(5, 4, 3))).toBe("lift");
    expect(narrowStage(stages(0, 0, 0))).toBe("face");
    expect(narrowStage(stages(2, 9, 2))).toBe("face");
  });

  it("the hands carry what the narrow stage is short of the line", () => {
    const speed: Record<TierId, number> = {
      helper: 1,
      cart: 18,
      hoist: 60,
      drill: 108,
      borer: 0,
      train: 0,
      machine: 0,
      kid: 0,
    };
    const running: Record<TierId, number> = {
      helper: 12,
      cart: 1,
      hoist: 1,
      drill: 0,
      borer: 0,
      train: 0,
      machine: 0,
      kid: 0,
    };
    // The spec's 12 hands, a cart and a hoist: the line is 27, the face
    // (no drill) is narrow and the hands carry all of it.
    expect(lineOf(speed, running)).toBe(27);
    expect(lineView(speed, running)).toEqual({ narrow: "face", handsCarry: 1 });
    // A drill lifts the face to 108: the haul (18) is narrow at 54 and the
    // hands carry 36 of it.
    const drill = { ...running, drill: 1 };
    expect(lineView(speed, drill)).toEqual({
      narrow: "haul",
      handsCarry: (54 - 18) / 54,
    });
    expect(
      lineView(speed, { ...running, helper: 0, cart: 0, hoist: 0 }),
    ).toEqual({ narrow: "face", handsCarry: 0 });
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

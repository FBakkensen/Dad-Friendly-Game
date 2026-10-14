import { describe, expect, it } from "vitest";
import { EMPTY_MATERIALS, materialsFromMined } from "./layers";
import {
  MOUNTAIN_STONES,
  accrue,
  accrueAway,
  createMountain,
  mineByHand,
  minedOut,
} from "./mountain";
import {
  LANTERN_VEIN_GAP_SCALE,
  VEIN_GLINT_MS,
  veinGapScale,
  advanceVein,
  mineVein,
  veinGlintMs,
  veinReward,
  waitForVein,
  pauseVein,
  resumeVein,
  veinWaitLeft,
} from "./veins";

const MINUTE = 60_000;

describe("golden veins", () => {
  it("waits 3 to 6 minutes of play before glinting", () => {
    expect(waitForVein({ now: 0, random: () => 0 })).toEqual({
      kind: "waiting",
      appearsAt: 3 * MINUTE,
    });
    expect(waitForVein({ now: 0, random: () => 0.999 }).kind).toBe("waiting");
    const latest = waitForVein({ now: 0, random: () => 1 });
    expect(latest).toEqual({ kind: "waiting", appearsAt: 6 * MINUTE });
  });

  it("glints at a spot on the mountain face, then moves on if missed", () => {
    const waiting = waitForVein({ now: 0, random: () => 0 });
    expect(
      advanceVein({ vein: waiting, now: 3 * MINUTE - 1, random: () => 0 }),
    ).toBe(waiting);

    const glint = advanceVein({
      vein: waiting,
      now: 3 * MINUTE,
      random: () => 0.5,
    });
    if (glint.kind !== "glinting") {
      throw new Error("vein should glint");
    }
    expect(glint.until).toBe(3 * MINUTE + VEIN_GLINT_MS);
    expect(glint.x).toBeCloseTo(0.5);
    expect(glint.y).toBeCloseTo(0.6);
    expect(
      advanceVein({ vein: glint, now: 3 * MINUTE + 1_000, random: () => 0 }),
    ).toBe(glint);
    expect(
      advanceVein({
        vein: glint,
        now: 3 * MINUTE + VEIN_GLINT_MS,
        random: () => 0,
      }),
    ).toEqual({ kind: "waiting", appearsAt: 6 * MINUTE + VEIN_GLINT_MS });
  });

  it("pays a minute of crew output, at least 50, capped by the mountain", () => {
    expect(
      veinReward({
        remaining: 1_000,
        pocket: 0,
        helpers: 0,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      }),
    ).toBe(50);
    expect(
      veinReward({
        remaining: 1_000,
        pocket: 0,
        helpers: 3,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      }),
    ).toBe(180);
    expect(
      veinReward({
        remaining: 20,
        pocket: 0,
        helpers: 3,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      }),
    ).toBe(20);
    expect(
      mineVein({
        remaining: 1_000,
        pocket: 7,
        helpers: 3,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      }),
    ).toEqual({
      remaining: 820,
      pocket: 187,
      helpers: 3,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
      materials: EMPTY_MATERIALS,
    });
    const empty = {
      remaining: 0,
      pocket: 7,
      helpers: 3,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    };
    expect(mineVein(empty)).toBe(empty);
  });

  it("grants a clay when the vein crosses 1,000,000 stones", () => {
    const mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 999_960,
      pocket: 999_960,
    };
    const tapped = mineVein(mountain);
    expect(minedOut(tapped)).toBe(1_000_010);
    expect(tapped.materials).toEqual({ ...EMPTY_MATERIALS, clay: 1 });
    expect(tapped.pocket).toBe(1_000_010);
  });

  it("matches materialsFromMined when a tap, the crew, time away, and a vein dig together", () => {
    let mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 39_900,
      pocket: 39_900,
      helpers: 2,
    };
    for (let tap = 0; tap < 10; tap += 1) {
      mountain = mineByHand(mountain);
    }
    mountain = accrue({ mountain, from: 0, to: 5_000 }).mountain;
    mountain = accrueAway({
      mountain,
      lastSeen: 0,
      now: 10_000,
    }).mountain;
    mountain = mineVein(mountain);
    expect(minedOut(mountain)).toBeGreaterThan(40_000);
    expect(mountain.materials).toEqual(materialsFromMined(minedOut(mountain)));
  });

  it("lets a golden vein linger longer once the old miner's lamp is home", () => {
    expect(veinGlintMs({})).toBe(VEIN_GLINT_MS);
    expect(veinGlintMs({ finds: ["pick"] })).toBe(VEIN_GLINT_MS);
    const lingered = veinGlintMs({ finds: ["lamp"] });
    expect(lingered).toBe(VEIN_GLINT_MS * 2);

    const waiting = waitForVein({ now: 0, random: () => 0 });
    const glint = advanceVein({
      vein: waiting,
      now: 3 * MINUTE,
      random: () => 0,
      glintMs: lingered,
    });
    expect(glint).toMatchObject({
      kind: "glinting",
      until: 3 * MINUTE + lingered,
    });
  });

  it("shortens the wait when a lamp is fitted, and keeps the lantern's share", () => {
    expect(veinGapScale({}, false)).toBe(1);
    expect(veinGapScale({}, true)).toBe(LANTERN_VEIN_GAP_SCALE);
    expect(veinGapScale({ crafted: { "crystal-lamp": 1 } }, false)).toBeCloseTo(
      1 / 1.25,
    );
    expect(veinGapScale({ crafted: { "crystal-lamp": 1 } }, true)).toBeCloseTo(
      LANTERN_VEIN_GAP_SCALE / 1.25,
    );
  });

  it("waits 40% less once the Lantern of Guidance is found", () => {
    expect(
      waitForVein({
        now: 0,
        random: () => 0,
        gapScale: LANTERN_VEIN_GAP_SCALE,
      }),
    ).toEqual({ kind: "waiting", appearsAt: 1.8 * MINUTE });
  });
});

describe("vein pause and resume", () => {
  it("shifts a wait or a glint by the time away", () => {
    expect(pauseVein({ kind: "waiting", appearsAt: 100 }, 50)).toEqual({
      kind: "waiting",
      appearsAt: 150,
    });
    expect(
      pauseVein({ kind: "glinting", until: 100, x: 0.5, y: 0.5 }, 50),
    ).toMatchObject({ until: 150 });
    expect(pauseVein({ kind: "waiting", appearsAt: 100 }, -5)).toEqual({
      kind: "waiting",
      appearsAt: 100,
    });
  });

  it("reports play time left and resumes only sane waits", () => {
    expect(veinWaitLeft({ kind: "waiting", appearsAt: 900 }, 100)).toBe(800);
    expect(
      veinWaitLeft({ kind: "glinting", until: 900, x: 0, y: 0 }, 100),
    ).toBe(0);
    expect(resumeVein({ waitLeft: 800, now: 100, random: () => 0 })).toEqual({
      kind: "waiting",
      appearsAt: 900,
    });
    for (const waitLeft of [undefined, Number.NaN, -1, 7 * 60_000, "800"]) {
      expect(resumeVein({ waitLeft, now: 0, random: () => 0 })).toEqual({
        kind: "waiting",
        appearsAt: 3 * 60_000,
      });
    }
  });
});
